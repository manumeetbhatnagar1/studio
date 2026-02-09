'use client';

import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Target,
  Video,
  CreditCard,
  ListTree,
  Users,
  ShieldOff,
} from 'lucide-react';
import type { NavItem } from '@/lib/types';

export const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Curriculum', href: '/curriculum', icon: ListTree },
  { title: 'User Management', href: '/admin/students', icon: Users },
  { title: 'Blocked Emails', href: '/admin/blocked-emails', icon: ShieldOff },
  { title: 'Content', href: '/content', icon: BookOpen },
  { title: 'Live Classes', href: '/live-classes', icon: Video },
  { title: 'Practice', href: '/practice', icon: ClipboardList },
  { title: 'Mock Tests', href: '/mock-tests', icon: Target },
  { title: 'Chat', href: '/chat', icon: MessagesSquare },
  { title: 'Doubts', href: '/doubts', icon: MessageSquare },
  { title: 'Subscription', href: '/subscription', icon: CreditCard },
];

export const mobileNavItems: NavItem[] = [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'Content', href: '/content', icon: BookOpen },
    { title: 'Practice', href: '/practice', icon: ClipboardList },
    { title: 'Chat', href: '/chat', icon: MessagesSquare },
];
