"""
Fare Calculator for Chennai Public Transport.

Estimates fares based on:
- Transport mode (Bus, Metro, Train)
- Distance traveled (for distance-based pricing)
- Number of transfers

Fare rules based on Chennai's actual pricing:
- MTC Bus: ₹5-25 based on distance
- Metro (CMRL): ₹10-60 based on stations
- Suburban Train: ₹5-30 based on distance
- Auto-rickshaw: ₹25-100 (if used as feeder)
- Walking: Free

These are estimates — actual fares may vary based on:
- Smart card discounts (Metro: 20% off)
- Peak/off-peak pricing
- Monthly passes (not accounted for here)
"""

from dataclasses import dataclass
from typing import Optional


# ──────────────────────────────────────────────────────
# Fare data structures
# ──────────────────────────────────────────────────────

@dataclass
class FareEstimate:
    """Fare estimate for a single transit leg."""

    mode: str  # "Bus", "Metro", "Train", "Walk"

    # Fare breakdown
    base_fare: float = 0.0
    distance_fare: float = 0.0
    transfer_penalty: float = 0.0
    total_fare: float = 0.0

    # Currency
    currency: str = "INR"

    # Notes
    notes: list[str] | None = None

    # Distance info
    distance_km: float = 0.0
    estimated_stations: int = 0  # For metro


@dataclass
class LegFareBreakdown:
    """Complete fare breakdown for an itinerary leg."""

    # Walking cost (free, but tracked)
    walking_fare: float = 0.0

    # Transit fares (may have multiple if transfers)
    transit_fares: list[FareEstimate] = None

    # Total for this leg
    total_leg_fare: float = 0.0

    # All in INR
    currency: str = "INR"

    def __post_init__(self):
        if self.transit_fares is None:
            self.transit_fares = []


@dataclass
class ItineraryFareSummary:
    """Total fare summary for an entire itinerary."""

    total_fare: float = 0.0
    currency: str = "INR"

    # Breakdown by mode
    bus_fare: float = 0.0
    metro_fare: float = 0.0
    train_fare: float = 0.0
    walking_fare: float = 0.0

    # Per-leg fares
    leg_fares: list[LegFareBreakdown] = None

    # Notes
    estimated: bool = True
    notes: list[str] | None = None

    def __post_init__(self):
        if self.leg_fares is None:
            self.leg_fares = []
        if self.notes is None:
            self.notes = []


# ──────────────────────────────────────────────────────
# Fare Calculator
# ──────────────────────────────────────────────────────

class FareCalculator:
    """
    Calculate fares for Chennai public transport.

    Usage:
        calculator = FareCalculator()
        fare = calculator.calculate_leg_fare(
            mode="Bus",
            distance_km=5.0,
            route_type=3,
        )
    """

    # ── MTC Bus fares (Chennai Metropolitan Transport Corporation) ──
    # Distance-based: ₹5 base + ₹1.5 per km after 2km
    BUS_BASE_FARE = 5.0
    BUS_PER_KM_AFTER_BASE = 1.5
    BUS_BASE_DISTANCE_KM = 2.0
    BUS_MIN_FARE = 5.0
    BUS_MAX_FARE = 25.0

    # ── Metro fares (Chennai Metro Rail Limited - CMRL) ──
    # Station-based: ₹10 for 1-2 stations, up to ₹60 for 12+ stations
    METRO_STATION_FARES = {
        1: 10,   # 1 station
        2: 10,   # 2 stations
        3: 15,   # 3 stations
        4: 20,   # 4 stations
        5: 25,   # 5 stations
        6: 30,   # 6 stations
        7: 35,   # 7 stations
        8: 40,   # 8 stations
        9: 45,   # 9 stations
        10: 50,  # 10 stations
        11: 55,  # 11 stations
        12: 60,  # 12+ stations
    }
    METRO_BASE_FARE = 10.0
    METRO_MAX_FARE = 60.0
    METRO_AVG_STATION_DISTANCE_KM = 1.2  # Average distance between metro stations

    # ── Suburban Train fares (Southern Railway) ──
    # Distance-based: ₹5 for short, up to ₹30 for long
    TRAIN_BASE_FARE = 5.0
    TRAIN_PER_KM = 1.0
    TRAIN_BASE_DISTANCE_KM = 5.0
    TRAIN_MIN_FARE = 5.0
    TRAIN_MAX_FARE = 30.0

    # ── Other modes ──
    AUTO_BASE_FARE = 25.0
    AUTO_PER_KM = 12.0

    def calculate_leg_fare(
        self,
        mode: str,
        distance_km: float = 0.0,
        route_type: int | None = None,
        route_name: str | None = None,
        transfers: int = 0,
    ) -> LegFareBreakdown:
        """
        Calculate fare for a complete leg (may include walking + transit).

        Args:
            mode: Transport mode string (e.g., "Walk+Bus+Walk", "Bus", "Metro")
            distance_km: Total distance for this leg
            route_type: GTFS route_type (0=Tram, 1=Metro, 2=Train, 3=Bus)
            route_name: Route name (e.g., "51C", "M1")
            transfers: Number of transfers in this leg

        Returns:
            LegFareBreakdown with fare details
        """

        breakdown = LegFareBreakdown(
            walking_fare=0.0,  # Walking is always free
            transit_fares=[],
            total_leg_fare=0.0,
        )

        # Parse mode string to get transit modes
        transit_modes = self._extract_transit_modes(mode)

        if not transit_modes:
            # Walking only
            breakdown.total_leg_fare = 0.0
            return breakdown

        # Calculate fare for each transit mode
        for transit_mode in transit_modes:
            fare = self._calculate_mode_fare(
                mode=transit_mode,
                distance_km=distance_km,
                route_type=route_type,
                route_name=route_name,
            )
            breakdown.transit_fares.append(fare)

        # Sum up transit fares
        transit_total = sum(f.total_fare for f in breakdown.transit_fares)

        # Add transfer penalty (if transferring between different modes)
        # In Chennai, transfers usually require separate tickets
        # Metro + Bus are separate systems, so transfer = pay again
        transfer_cost = 0.0
        if transfers > 0 and len(transit_modes) > 1:
            # Each transfer may require a new ticket
            # Estimate: base fare for each additional boarding
            for i in range(transfers):
                if i < len(transit_modes):
                    additional_mode = transit_modes[i % len(transit_modes)]
                    additional_fare = self._calculate_mode_fare(
                        mode=additional_mode,
                        distance_km=0,  # Short transfer
                        route_type=route_type,
                    )
                    transfer_cost += additional_fare.base_fare * 0.5  # Partial fare for short trip

        breakdown.total_leg_fare = transit_total + transfer_cost
        breakdown.walking_fare = 0.0

        return breakdown

    def calculate_itinerary_fare(
        self,
        legs: list[dict],
    ) -> ItineraryFareSummary:
        """
        Calculate total fare for an entire itinerary.

        Args:
            legs: List of leg dictionaries from ItineraryLeg

        Returns:
            ItineraryFareSummary with complete fare breakdown
        """

        summary = ItineraryFareSummary(
            total_fare=0.0,
            bus_fare=0.0,
            metro_fare=0.0,
            train_fare=0.0,
            walking_fare=0.0,
            leg_fares=[],
            notes=[],
        )

        for leg in legs:
            mode = leg.get("mode", "Walk")
            distance = leg.get("walking_distance_km", 0.0)
            route_type = leg.get("route_type")
            route_name = leg.get("route_name")
            transfers = leg.get("transfers", 0)

            leg_fare = self.calculate_leg_fare(
                mode=mode,
                distance_km=distance,
                route_type=route_type,
                route_name=route_name,
                transfers=transfers,
            )

            summary.leg_fares.append(leg_fare)
            summary.total_fare += leg_fare.total_leg_fare

            # Break down by mode
            for fare in leg_fare.transit_fares:
                if fare.mode == "Bus":
                    summary.bus_fare += fare.total_fare
                elif fare.mode == "Metro":
                    summary.metro_fare += fare.total_fare
                elif fare.mode == "Train":
                    summary.train_fare += fare.total_fare

        # Round for display
        summary.total_fare = round(summary.total_fare, 2)
        summary.bus_fare = round(summary.bus_fare, 2)
        summary.metro_fare = round(summary.metro_fare, 2)
        summary.train_fare = round(summary.train_fare, 2)

        # Add notes
        if summary.total_fare > 0:
            summary.notes.append("Fares are estimates based on standard pricing")
            summary.notes.append("Smart card discounts not applied (Metro: ~20% off)")
        else:
            summary.notes.append("No transit fare — walking only")

        return summary

    # ──────────────────────────────────────────────────
    # Mode-specific fare calculation
    # ──────────────────────────────────────────────────

    def _calculate_mode_fare(
        self,
        mode: str,
        distance_km: float = 0.0,
        route_type: int | None = None,
        route_name: str | None = None,
    ) -> FareEstimate:
        """Calculate fare for a specific transport mode."""

        if mode == "Bus":
            return self._bus_fare(distance_km)
        elif mode == "Metro":
            return self._metro_fare(distance_km, route_name)
        elif mode == "Train":
            return self._train_fare(distance_km)
        else:
            return FareEstimate(
                mode=mode,
                base_fare=0.0,
                total_fare=0.0,
                notes=[f"Unknown mode: {mode}"],
            )

    def _bus_fare(self, distance_km: float) -> FareEstimate:
        """
        MTC Bus fare calculation.
        Base ₹5 for first 2km, then ₹1.5/km.
        """

        if distance_km <= 0:
            distance_km = 3.0  # Default estimate

        base = self.BUS_BASE_FARE

        if distance_km <= self.BUS_BASE_DISTANCE_KM:
            distance_fare = 0.0
        else:
            extra_km = distance_km - self.BUS_BASE_DISTANCE_KM
            distance_fare = extra_km * self.BUS_PER_KM_AFTER_BASE

        total = base + distance_fare
        total = max(self.BUS_MIN_FARE, min(self.BUS_MAX_FARE, total))

        return FareEstimate(
            mode="Bus",
            base_fare=base,
            distance_fare=round(distance_fare, 2),
            total_fare=round(total, 2),
            distance_km=distance_km,
            notes=[f"MTC bus: ₹{base} base + ₹{distance_fare:.1f} distance"],
        )

    def _metro_fare(
        self,
        distance_km: float,
        route_name: str | None = None,
    ) -> FareEstimate:
        """
        CMRL Metro fare calculation.
        Based on number of stations (estimated from distance).
        """

        # Estimate stations from distance
        if distance_km <= 0:
            distance_km = 4.0  # Default estimate

        estimated_stations = max(1, round(distance_km / self.METRO_AVG_STATION_DISTANCE_KM))

        # Look up fare from station-based pricing
        fare = self.METRO_BASE_FARE
        for stations, price in sorted(self.METRO_STATION_FARES.items()):
            if estimated_stations <= stations:
                fare = price
                break
        else:
            fare = self.METRO_MAX_FARE

        notes = [f"CMRL metro: ~{estimated_stations} stations"]
        if route_name:
            notes.append(f"Route: {route_name}")

        return FareEstimate(
            mode="Metro",
            base_fare=self.METRO_BASE_FARE,
            distance_fare=fare - self.METRO_BASE_FARE,
            total_fare=fare,
            distance_km=distance_km,
            estimated_stations=estimated_stations,
            notes=notes,
        )

    def _train_fare(self, distance_km: float) -> FareEstimate:
        """
        Suburban Train fare calculation.
        Base ₹5 for first 5km, then ₹1/km.
        """

        if distance_km <= 0:
            distance_km = 8.0  # Default estimate

        base = self.TRAIN_BASE_FARE

        if distance_km <= self.TRAIN_BASE_DISTANCE_KM:
            distance_fare = 0.0
        else:
            extra_km = distance_km - self.TRAIN_BASE_DISTANCE_KM
            distance_fare = extra_km * self.TRAIN_PER_KM

        total = base + distance_fare
        total = max(self.TRAIN_MIN_FARE, min(self.TRAIN_MAX_FARE, total))

        return FareEstimate(
            mode="Train",
            base_fare=base,
            distance_fare=round(distance_fare, 2),
            total_fare=round(total, 2),
            distance_km=distance_km,
            notes=[f"Suburban train: ₹{base} base + ₹{distance_fare:.1f} distance"],
        )

    # ──────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────

    def _extract_transit_modes(self, mode_string: str) -> list[str]:
        """
        Extract transit modes from a mode string.
        E.g., "Walk+Bus+Walk" → ["Bus"]
              "Walk+Metro+Bus+Walk" → ["Metro", "Bus"]
              "Bus" → ["Bus"]
        """

        parts = mode_string.split("+")
        transit_modes = []

        for part in parts:
            part = part.strip()
            if part in ("Bus", "Metro", "Train", "Tram", "Ferry"):
                transit_modes.append(part)

        return transit_modes

    def get_fare_display(self, fare: float) -> str:
        """Format fare for display."""
        return f"₹{fare:.0f}"

    def get_fare_range_display(self, min_fare: float, max_fare: float) -> str:
        """Format fare range for display."""
        if min_fare == max_fare:
            return f"₹{min_fare:.0f}"
        return f"₹{min_fare:.0f} - ₹{max_fare:.0f}"
