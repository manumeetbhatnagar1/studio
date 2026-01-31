import type { LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
};

export type TestResult = {
  topic: string;
  score: number;
  maxScore: number;
};
