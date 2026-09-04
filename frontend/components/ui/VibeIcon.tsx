import {
  Landmark,
  Leaf,
  Mountain,
  Tent,
  UtensilsCrossed,
  Castle,
  Flower2,
  PartyPopper,
  ShoppingBag,
  Trees,
  Heart,
  Waves,
  Users,
  Sparkles,
  Gem,
  Puzzle,
  MapPin,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Landmark,
  Leaf,
  Mountain,
  Tent,
  UtensilsCrossed,
  Castle,
  Flower2,
  PartyPopper,
  ShoppingBag,
  Trees,
  Heart,
  Waves,
  Users,
  Sparkles,
  Gem,
  Puzzle,
  MapPin,
  Clapperboard,
};

// Resolves a VibeDef's icon key (e.g. "Landmark") to its lucide-react
// component. Falls back to MapPin so an unrecognised key never crashes.
export default function VibeIcon({
  icon,
  size = 16,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[icon] ?? MapPin;
  return <Icon size={size} className={className} />;
}
