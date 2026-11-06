import {
  Baby,
  Bath,
  BedDouble,
  Briefcase,
  Car,
  ChefHat,
  DoorOpen,
  Dumbbell,
  Gamepad2,
  House,
  Library,
  Package,
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
  [Utensils, ["silverware", "silverware-fork-knife", "silverware-variant", "table-chair"]],
  [WashingMachine, ["washing-machine", "tumble-dryer", "washing-machine-alert"]],
  [TreeDeciduous, ["tree", "tree-outline", "flower", "flower-outline", "sprout", "grass", "pine-tree"]],
  [Settings, ["cog", "cog-outline", "server", "server-network", "router-wireless"]],
  [Bath, ["bathtub", "bathtub-outline", "shower", "shower-head"]],
  [DoorOpen, ["door", "door-open", "door-closed", "coat-rack", "stairs"]],
  [Toilet, ["toilet", "paper-roll", "paper-roll-outline"]],
  [SquareParking, ["parking"]],
  [Car, ["car", "car-outline", "garage", "garage-variant", "garage-open"]],
  [Briefcase, ["desk", "laptop", "briefcase", "briefcase-outline", "office-building"]],
  [Tv, ["television", "television-classic", "theater"]],
  [Dumbbell, ["dumbbell", "weight-lifter"]],
  [Library, ["bookshelf", "library", "book-open-variant"]],
  [Gamepad2, ["gamepad-variant", "controller", "controller-classic"]],
  [Shirt, ["hanger", "wardrobe", "wardrobe-outline", "tshirt-crew"]],
  [Package, ["package", "package-variant", "archive", "warehouse", "garage-variant-lock"]],
];

const byName = new Map(
  icons.flatMap(([icon, names]) => names.map((name) => [name, icon] as const)),
);

export function areaIcon(icon: string | null | undefined): LucideIcon {
  return byName.get(icon?.replace(/^mdi:/, "") ?? "") ?? House;
}
