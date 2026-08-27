"""
Comparison Service for Itineraries.

Analyzes multiple itineraries and produces a side-by-side comparison:
- Timing breakdown (visit, travel, walk, transit, wait)
- Transit availability per leg
- Place availability checks
- Recommendation with reasoning
"""

from .compare_schemas import (
    CompareRequest,
    CompareResponse,
    ComparisonVerdict,
    ItineraryToCompare,
    LegComparison,
    PlaceAvailability,
    TimingBreakdown,
    TransitSummary,
)


class ComparisonService:

    def compare(self, request: CompareRequest) -> CompareResponse:
        """
        Compare multiple itineraries and return side-by-side analysis.
        """

        itineraries = request.itineraries
        n = len(itineraries)

        # ── 1. Timing breakdowns ──
        timing = self._build_timing_breakdowns(itineraries)

        # ── 2. Leg-by-leg comparison ──
        leg_comparison = self._compare_legs(itineraries)

        # ── 3. Transit summaries ──
        transit_summaries = self._build_transit_summaries(itineraries)

        # ── 4. Place availability ──
        place_availability = self._check_place_availability(itineraries)

        # ── 5. Verdict ──
        verdict = self._generate_verdict(
            itineraries, timing, transit_summaries, request.prioritize
        )

        # ── 6. Comparison matrix (for UI) ──
        matrix = self._build_comparison_matrix(
            itineraries, timing, transit_summaries
        )

        # ── 7. Fare comparison ──
        cheapest_idx, most_expensive_idx, fare_savings = (
            self._compare_fares(itineraries, timing, transit_summaries)
        )

        return CompareResponse(
            total_itineraries=n,
            timing=timing,
            leg_comparison=leg_comparison,
            transit_summaries=transit_summaries,
            place_availability=place_availability,
            verdict=verdict,
            comparison_matrix=matrix,
            cheapest_index=cheapest_idx,
            most_expensive_index=most_expensive_idx,
            fare_savings=fare_savings,
        )

    # ──────────────────────────────────────────────────
    # Timing breakdowns
    # ──────────────────────────────────────────────────

    def _build_timing_breakdowns(
        self,
        itineraries: list[ItineraryToCompare],
    ) -> list[TimingBreakdown]:
        """Build timing breakdown for each itinerary."""

        results = []

        for idx, it in enumerate(itineraries, start=1):
            total = max(it.total_time_hr, 0.01)  # Avoid division by zero

            # Calculate fare metrics
            total_fare = getattr(it, 'total_fare', 0.0)
            fare_per_hour = total_fare / max(it.total_time_hr, 0.01)

            results.append(TimingBreakdown(
                itinerary_label=f"Itinerary {idx}",
                total_hours=round(it.total_time_hr, 2),
                visit_hours=round(it.total_visit_time_hr, 2),
                travel_hours=round(it.total_travel_time_hr, 2),
                walking_hours=round(it.total_walking_time_hr, 2),
                transit_hours=round(it.total_transit_time_hr, 2),
                wait_hours=round(it.total_wait_time_hr, 2),
                visit_pct=round((it.total_visit_time_hr / total) * 100, 1),
                travel_pct=round((it.total_travel_time_hr / total) * 100, 1),
                transit_pct=round((it.total_transit_time_hr / total) * 100, 1),
                walking_pct=round((it.total_walking_time_hr / total) * 100, 1),
                total_fare=round(total_fare, 2),
                fare_per_hour=round(fare_per_hour, 2),
            ))

        return results

    # ──────────────────────────────────────────────────
    # Leg-by-leg comparison
    # ──────────────────────────────────────────────────

    def _compare_legs(
        self,
        itineraries: list[ItineraryToCompare],
    ) -> list[LegComparison]:
        """
        Compare legs across itineraries.
        Aligns legs by index (leg 0 = first leg in each itinerary).
        """

        # Find max number of legs
        max_legs = max(len(it.legs) for it in itineraries) if itineraries else 0

        results = []

        for leg_idx in range(max_legs):
            travel_minutes = []
            modes = []
            transit_available = []
            route_names = []

            for it in itineraries:
                if leg_idx < len(it.legs):
                    leg = it.legs[leg_idx]
                    travel_minutes.append(leg.get("travel_duration_minutes", 0))
                    modes.append(leg.get("mode", "Unknown"))
                    transit_available.append(leg.get("transit_available", False))
                    route_names.append(leg.get("route_name"))
                else:
                    # This itinerary has fewer legs
                    travel_minutes.append(0)
                    modes.append("N/A")
                    transit_available.append(False)
                    route_names.append(None)

            # Find fastest option
            valid_times = [
                (i, t) for i, t in enumerate(travel_minutes) if t > 0
            ]
            fastest_idx = -1
            if valid_times:
                fastest_idx = min(valid_times, key=lambda x: x[1])[0]
                # Mark as -1 if tied
                min_time = min(t for _, t in valid_times)
                tied = [i for i, t in valid_times if t == min_time]
                if len(tied) > 1:
                    fastest_idx = -1

            # Find option with transit
            has_transit_idx = -1
            for i, avail in enumerate(transit_available):
                if avail:
                    has_transit_idx = i
                    break

            # Get place names (from legs data)
            from_place = ""
            to_place = ""
            if itineraries[0].legs and leg_idx < len(itineraries[0].legs):
                leg0 = itineraries[0].legs[leg_idx]
                from_place = leg0.get("from_place_name", f"Place {leg_idx + 1}")
                to_place = leg0.get("to_place_name", f"Place {leg_idx + 2}")

            # Get fares
            fares = []
            for it in itineraries:
                if leg_idx < len(it.legs):
                    fare = it.legs[leg_idx].get("fare_total", 0.0)
                    fares.append(fare)
                else:
                    fares.append(0.0)

            # Find cheapest option
            valid_fares = [(i, f) for i, f in enumerate(fares) if f > 0]
            cheapest_leg_idx = -1
            if valid_fares:
                cheapest_leg_idx = min(valid_fares, key=lambda x: x[1])[0]
                min_fare = min(f for _, f in valid_fares)
                tied = [i for i, f in valid_fares if f == min_fare]
                if len(tied) > 1:
                    cheapest_leg_idx = -1

            results.append(LegComparison(
                leg_index=leg_idx,
                from_place=from_place,
                to_place=to_place,
                travel_minutes=travel_minutes,
                modes=modes,
                transit_available=transit_available,
                route_names=route_names,
                fares=fares,
                fastest_index=fastest_idx,
                has_transit_index=has_transit_idx,
                cheapest_index=cheapest_leg_idx,
            ))

        return results

    # ──────────────────────────────────────────────────
    # Transit summaries
    # ──────────────────────────────────────────────────

    def _build_transit_summaries(
        self,
        itineraries: list[ItineraryToCompare],
    ) -> list[TransitSummary]:
        """Build transit availability summary for each itinerary."""

        results = []

        for idx, it in enumerate(itineraries, start=1):
            total_legs = len(it.legs)
            legs_with_transit = sum(
                1 for leg in it.legs if leg.get("transit_available", False)
            )

            # Collect modes
            modes_used = list({
                leg.get("mode", "").split("+")[-1]
                for leg in it.legs
                if leg.get("transit_available", False)
            })

            # Total transfers
            total_transfers = sum(
                leg.get("transfers", 0) for leg in it.legs
            )

            # Fastest/slowest leg
            leg_times = [
                leg.get("travel_duration_minutes", 0)
                for leg in it.legs
                if leg.get("travel_duration_minutes", 0) > 0
            ]

            # Calculate fare breakdown by mode
            fare_by_mode = {}
            total_fare = 0.0
            for leg in it.legs:
                fare = leg.get("fare_total", 0.0)
                total_fare += fare
                if leg.get("transit_available", False):
                    mode = leg.get("mode", "").split("+")[-1] if "+" in leg.get("mode", "") else leg.get("mode", "")
                    fare_by_mode[mode] = fare_by_mode.get(mode, 0.0) + fare

            results.append(TransitSummary(
                itinerary_label=f"Itinerary {idx}",
                total_legs=total_legs,
                legs_with_transit=legs_with_transit,
                transit_coverage_pct=round(
                    (legs_with_transit / total_legs * 100) if total_legs > 0 else 0,
                    1,
                ),
                modes_used=modes_used,
                total_transfers=total_transfers,
                fastest_leg_minutes=min(leg_times) if leg_times else None,
                slowest_leg_minutes=max(leg_times) if leg_times else None,
                total_fare=round(total_fare, 2),
                fare_by_mode=fare_by_mode,
            ))

        return results

    # ──────────────────────────────────────────────────
    # Place availability
    # ──────────────────────────────────────────────────

    def _check_place_availability(
        self,
        itineraries: list[ItineraryToCompare],
    ) -> list[PlaceAvailability]:
        """
        Check if places are open when you'd arrive.
        Uses coarse best_time_of_day from source data.
        """

        # Collect all unique places across itineraries
        place_map: dict[str, dict] = {}

        for it in itineraries:
            for place_data in it.places:
                name = place_data.get("name", "")
                if name and name not in place_map:
                    place_map[name] = place_data

        results = []

        for name, place_data in place_map.items():
            best_times = place_data.get("best_time_of_day", [])

            arrival_times = []
            fits_best_time = []

            for it in itineraries:
                # Find this place's arrival time in this itinerary
                arrival = None
                for p in it.places:
                    if p.get("name") == name:
                        arrival = p.get("arrive_at")
                        break

                arrival_times.append(arrival)

                # Check if arrival fits best_time_of_day
                if arrival and best_times:
                    hour = arrival.hour if hasattr(arrival, 'hour') else 0
                    fits = self._hour_fits_time_of_day(hour, best_times)
                    fits_best_time.append(fits)
                else:
                    fits_best_time.append(None)

            results.append(PlaceAvailability(
                place_name=name,
                best_time_of_day=best_times,
                arrival_times=arrival_times,
                arrival_fits_best_time=fits_best_time,
            ))

        return results

    @staticmethod
    def _hour_fits_time_of_day(hour: int, best_times: list[str]) -> bool:
        """Check if an hour fits the best_time_of_day categories."""

        time_ranges = {
            "Morning": (6, 12),
            "Afternoon": (12, 17),
            "Evening": (17, 20),
            "Night": (20, 24),
            "Sunrise": (5, 7),
            "Daytime": (8, 18),
            "Anytime": (0, 24),
        }

        for time_name in best_times:
            if time_name in time_ranges:
                start, end = time_ranges[time_name]
                if start <= hour < end:
                    return True

        return False

    # ──────────────────────────────────────────────────
    # Verdict generation
    # ──────────────────────────────────────────────────

    def _generate_verdict(
        self,
        itineraries: list[ItineraryToCompare],
        timing: list[TimingBreakdown],
        transit_summaries: list[TransitSummary],
        prioritize: str,
    ) -> ComparisonVerdict:
        """Generate a recommendation based on comparison."""

        if not itineraries:
            return ComparisonVerdict(
                winner_index=-1,
                reason="No itineraries to compare",
                trade_offs=[],
            )

        n = len(itineraries)

        # ── Score each itinerary ──
        scores = [0.0] * n

        for i in range(n):
            it = itineraries[i]
            t = timing[i]
            ts = transit_summaries[i]

            # Speed score (less time = better)
            if t.total_hours > 0:
                scores[i] += (1.0 / t.total_hours) * 30

            # Transit score (more transit = better)
            scores[i] += ts.transit_coverage_pct * 0.2

            # Visit score (more time visiting = better)
            if t.total_hours > 0:
                scores[i] += t.visit_pct * 0.1

            # Walking penalty (less walking = better)
            scores[i] -= t.walking_pct * 0.05

            # Quality score
            scores[i] += it.average_place_score * 20

            # ── Priority adjustments ──
            if prioritize == "speed":
                scores[i] += (1.0 / max(t.total_hours, 0.1)) * 50
            elif prioritize == "transit":
                scores[i] += ts.transit_coverage_pct * 0.5
            elif prioritize == "walking":
                scores[i] -= t.walking_hours * 10

        # ── Find winner ──
        winner_idx = max(range(n), key=lambda i: scores[i])

        # Check if winner is clearly better (>10% margin)
        sorted_scores = sorted(scores, reverse=True)
        if n > 1 and sorted_scores[0] > sorted_scores[1] * 1.1:
            reason = self._explain_winner(
                itineraries[winner_idx],
                timing[winner_idx],
                transit_summaries[winner_idx],
                prioritize,
            )
        else:
            # Close call — mention trade-offs
            winner_idx = -1
            reason = "Itineraries are very similar — choose based on your preference"

        # ── Trade-offs ──
        trade_offs = self._identify_trade_offs(itineraries, timing, transit_summaries)

        return ComparisonVerdict(
            winner_index=winner_idx,
            reason=reason,
            trade_offs=trade_offs,
        )

    def _explain_winner(
        self,
        winner: ItineraryToCompare,
        timing: TimingBreakdown,
        transit: TransitSummary,
        prioritize: str,
    ) -> str:
        """Generate human-readable explanation for the winner."""

        parts = []

        if prioritize == "speed":
            parts.append(f"Fastest option at {timing.total_hours:.1f} hours total")
        elif prioritize == "transit":
            parts.append(
                f"Best transit coverage: {transit.transit_coverage_pct:.0f}% of legs use public transport"
            )
        elif prioritize == "walking":
            parts.append(f"Least walking: only {timing.walking_hours:.1f} hours on foot")
        elif prioritize == "budget":
            parts.append(f"Most affordable at ₹{timing.total_fare:.0f} total fare")
        else:
            # Balanced
            fare_text = f", ₹{timing.total_fare:.0f} fare" if timing.total_fare > 0 else ""
            parts.append(
                f"Best balance: {timing.total_hours:.1f} hours, "
                f"{transit.transit_coverage_pct:.0f}% transit coverage, "
                f"{timing.visit_pct:.0f}% time spent visiting{fare_text}"
            )

        if transit.modes_used:
            parts.append(f"Uses: {', '.join(transit.modes_used)}")

        if winner.all_legs_have_transit:
            parts.append("All legs have public transit available")

        return ". ".join(parts) + "."

    def _identify_trade_offs(
        self,
        itineraries: list[ItineraryToCompare],
        timing: list[TimingBreakdown],
        transit_summaries: list[TransitSummary],
    ) -> list[str]:
        """Identify key trade-offs between itineraries."""

        trade_offs = []

        if len(itineraries) < 2:
            return trade_offs

        # Compare first two itineraries (most common case)
        t0, t1 = timing[0], timing[1]
        ts0, ts1 = transit_summaries[0], transit_summaries[1]

        # Speed trade-off
        if abs(t0.total_hours - t1.total_hours) > 0.3:
            faster = 0 if t0.total_hours < t1.total_hours else 1
            slower = 1 - faster
            trade_offs.append(
                f"Itinerary {faster + 1} is {abs(t0.total_hours - t1.total_hours):.1f} hours faster"
            )

        # Transit trade-off
        if abs(ts0.transit_coverage_pct - ts1.transit_coverage_pct) > 20:
            better_transit = 0 if ts0.transit_coverage_pct > ts1.transit_coverage_pct else 1
            trade_offs.append(
                f"Itinerary {better_transit + 1} has better transit coverage"
            )

        # Walking trade-off
        if abs(t0.walking_hours - t1.walking_hours) > 0.2:
            less_walking = 0 if t0.walking_hours < t1.walking_hours else 1
            trade_offs.append(
                f"Itinerary {less_walking + 1} has {abs(t0.walking_hours - t1.walking_hours):.1f} hours less walking"
            )

        # Visit time trade-off
        if abs(t0.visit_hours - t1.visit_hours) > 0.3:
            more_visiting = 0 if t0.visit_hours > t1.visit_hours else 1
            trade_offs.append(
                f"Itinerary {more_visiting + 1} allows {abs(t0.visit_hours - t1.visit_hours):.1f} hours more visiting"
            )

        # Fare trade-off
        if abs(t0.total_fare - t1.total_fare) > 5:
            cheaper = 0 if t0.total_fare < t1.total_fare else 1
            savings = abs(t0.total_fare - t1.total_fare)
            trade_offs.append(
                f"Itinerary {cheaper + 1} costs ₹{savings:.0f} less"
            )

        return trade_offs

    # ──────────────────────────────────────────────────
    # Comparison matrix (for UI rendering)
    # ──────────────────────────────────────────────────

    def _build_comparison_matrix(
        self,
        itineraries: list[ItineraryToCompare],
        timing: list[TimingBreakdown],
        transit_summaries: list[TransitSummary],
    ) -> dict:
        """
        Build a matrix for easy UI rendering.
        Structure: {metric_name: [value_for_itin_1, value_for_itin_2, ...]}
        """

        n = len(itineraries)

        matrix = {
            "labels": [f"Itinerary {i + 1}" for i in range(n)],
            "total_hours": [t.total_hours for t in timing],
            "visit_hours": [t.visit_hours for t in timing],
            "travel_hours": [t.travel_hours for t in timing],
            "walking_hours": [t.walking_hours for t in timing],
            "transit_hours": [t.transit_hours for t in timing],
            "wait_hours": [t.wait_hours for t in timing],
            "visit_pct": [t.visit_pct for t in timing],
            "transit_coverage_pct": [ts.transit_coverage_pct for ts in transit_summaries],
            "total_legs": [ts.total_legs for ts in transit_summaries],
            "legs_with_transit": [ts.legs_with_transit for ts in transit_summaries],
            "total_transfers": [ts.total_transfers for ts in transit_summaries],
            "modes_used": [ts.modes_used for ts in transit_summaries],
            "place_scores": [it.average_place_score for it in itineraries],
            "total_fare": [t.total_fare for t in timing],
            "fare_per_hour": [t.fare_per_hour for t in timing],
            "fare_by_mode": [ts.fare_by_mode for ts in transit_summaries],
        }

        return matrix

    def _compare_fares(
        self,
        itineraries: list[ItineraryToCompare],
        timing: list[TimingBreakdown],
        transit_summaries: list[TransitSummary],
    ) -> tuple[int, int, float]:
        """
        Compare fares across itineraries.
        Returns: (cheapest_index, most_expensive_index, fare_savings)
        """

        fares = [t.total_fare for t in timing]

        if not fares or all(f == 0 for f in fares):
            return -1, -1, 0.0

        cheapest_idx = fares.index(min(fares))
        expensive_idx = fares.index(max(fares))

        # If all same fare, no clear winner
        if min(fares) == max(fares):
            cheapest_idx = -1
            expensive_idx = -1

        fare_savings = max(fares) - min(fares)

        return cheapest_idx, expensive_idx, round(fare_savings, 2)
