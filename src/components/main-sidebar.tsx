
'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/icons';
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
import { navItems } from '@/lib/nav-config';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Skeleton } from './ui/skeleton';

export default function MainSidebar() {
  const pathname = usePathname();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();

  return (
    <>
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo className="w-8 h-8 text-primary" />
          <span className="font-headline text-2xl font-semibold text-primary">
            DCAM Classes
          </span>
        </Link>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarMenu>
          {isAdminLoading ? (
            <div className="p-2 space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            navItems.map((item) => {
              if (item.href.startsWith('/admin') && !isAdmin) {
                  return null;
              }
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={{ children: item.title }}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                      {item.label && <Badge variant="destructive" className="ml-auto">{item.label}</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })
          )}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        {/* Placeholder for future footer items, e.g., settings, logout */}
      </SidebarFooter>
    </>
  );
}
