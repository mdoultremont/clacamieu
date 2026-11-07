import {
  Baby,
  Bath,
  BedDouble,
  BedSingle,
  Briefcase,
  Car,
  ChefHat,
  DoorOpen,
  Dumbbell,
  Footprints,
  Gamepad2,
  House,
  Library,
  Monitor,
  Package,
  Presentation,
  Settings,
  Shirt,
  Sofa,
  SquareParking,
  Toilet,
  TreeDeciduous,
  Tv,
  Utensils,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

// Home Assistant areas carry Material Design icon names; the panel draws Lucide.
const icons: [LucideIcon, string[]][] = [
  [Sofa, ["sofa", "sofa-outline", "sofa-single", "sofa-single-outline"]],
  [Baby, ["baby", "baby-carriage", "baby-face", "baby-face-outline"]],
  [
    BedDouble,
    ["bed", "bed-outline", "bed-king", "bed-king-outline", "bed-queen", "bed-queen-outline", "bed-double", "bed-double-outline", "bed-empty"],
  ],
  [ChefHat, ["chef-hat", "stove", "fridge", "fridge-outline", "countertop"]],
  [BedSingle, ["bed-single", "bed-single-outline"]],
  [Utensils, ["silverware", "silverware-fork-knife", "silverware-variant", "table-chair", "room-service-outline"]],
  [WashingMachine, ["washing-machine", "tumble-dryer", "washing-machine-alert"]],
  [TreeDeciduous, ["tree", "tree-outline", "flower", "flower-outline", "sprout", "grass", "pine-tree"]],
  [Settings, ["cog", "cog-outline", "server", "server-network", "router-wireless"]],
  [Bath, ["bathtub", "bathtub-outline", "shower", "shower-head"]],
  [DoorOpen, ["door", "door-open", "door-closed", "coat-rack", "stairs"]],
  [Footprints, ["foot-print", "shoe-print"]],
  [Toilet, ["toilet", "paper-roll", "paper-roll-outline"]],
  [SquareParking, ["parking"]],
  [Car, ["car", "car-outline", "garage", "garage-variant", "garage-open"]],
  [Briefcase, ["desk", "laptop", "briefcase", "briefcase-outline", "office-building"]],
  [Tv, ["television", "television-classic", "theater"]],
  [Dumbbell, ["dumbbell", "weight-lifter"]],
  [Library, ["bookshelf", "library", "book-open-variant"]],
  [Gamepad2, ["gamepad-variant", "gamepad-variant-outline", "controller", "controller-classic"]],
  [Monitor, ["monitor", "monitor-shimmer"]],
  [Presentation, ["presentation"]],
  [Shirt, ["hanger", "wardrobe", "wardrobe-outline", "tshirt-crew"]],
  [Package, ["package", "package-variant", "archive", "archive-outline", "warehouse", "garage-variant-lock"]],
];

const byName = new Map(
  icons.flatMap(([icon, names]) => names.map((name) => [name, icon] as const)),
);

export function areaIcon(icon: string | null | undefined): LucideIcon {
  return byName.get(icon?.replace(/^mdi:/, "") ?? "") ?? House;
}
