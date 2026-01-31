import type { LucideIcon } from "lucide-react";
import type { Timestamp } from "firebase/firestore";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
};
