import {
  BookOpen,
  Brain,
  Briefcase,
  Code,
  Dumbbell,
  Folder,
  Gamepad2,
  GraduationCap,
  Heart,
  Music,
  Palette,
  PenLine,
  Sparkles,
  Circle,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  brain: Brain,
  briefcase: Briefcase,
  code: Code,
  dumbbell: Dumbbell,
  folder: Folder,
  "gamepad-2": Gamepad2,
  "graduation-cap": GraduationCap,
  heart: Heart,
  music: Music,
  palette: Palette,
  "pen-line": PenLine,
  sparkles: Sparkles,
};

export const CATEGORY_ICON_CHOICES = Object.keys(ICONS);

export function iconForCategory(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Circle;
}
