
'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Target,
  Video,
  PenSquare,
} from 'lucide-react';
import { Logo } from '@/components/icons';
import type { NavItem } from '@/lib/types';
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Badge } from './ui/badge';

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Content', href: '/content', icon: BookOpen },
  { title: 'Live Classes', href: '/live-classes', icon: Video },
  { title: 'Practice', href: '/practice', icon: ClipboardList },
  { title: 'Mock Tests', href: '/mock-tests', icon: Target },
  { title: 'Doubts', href: '/doubts', icon: MessageSquare },
  { title: 'Study Requirements', href: '/study-requirements', icon: PenSquare },
];

export default function MainSidebar() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo className="w-8 h-8 text-primary" />
          <span className="font-headline text-2xl font-semibold text-primary">
            JEE Prep Ace
          </span>
        </Link>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={{ children: item.title }}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                  {item.label && <Badge variant="destructive" className="ml-auto">{item.label}</Badge>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        {/* Placeholder for future footer items, e.g., settings, logout */}
      </SidebarFooter>
    </>
  );
}
