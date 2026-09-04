import { Sunrise, Sun, Sunset, Moon, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Sunrise, Sun, Sunset, Moon };

export default function TimeIcon({
  icon,
  size = 14,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[icon] ?? Sun;
  return <Icon size={size} className={className} />;
}
