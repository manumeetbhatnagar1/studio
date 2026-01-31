import type { LucideIcon } from "lucide-react";
import type { Timestamp } from "firebase/firestore";

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

export type StudyRequirement = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  subject: string;
  examType: string;
  classPreference: 'Online' | 'Offline';
  status: 'Open' | 'Closed';
  createdAt?: Timestamp;
};
