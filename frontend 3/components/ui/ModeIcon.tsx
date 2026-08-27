import { Bus, Footprints, TrainFront, TramFront } from "lucide-react";
import type { ModeDef } from "@/lib/constants";

const ICONS = {
  walk: Footprints,
  bus: Bus,
  metro: TrainFront,
  train: TrainFront,
  tram: TramFront,
} as const;

export default function ModeIcon({
  mode,
  size = 16,
  className,
}: {
  mode: ModeDef;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[mode.icon] ?? Footprints;
  return <Icon size={size} className={className} style={{ color: mode.color }} />;
}
