'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mobileNavItems } from '@/lib/nav-config';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';

export default function BottomNav() {
  const pathname = usePathname();
  const { isMobile } = useSidebar();

  if (!isMobile) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full h-16 bg-background border-t">
      <div className="grid h-full max-w-lg grid-cols-4 mx-auto font-medium">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.title}
              href={item.href}
              className={cn(
                'inline-flex flex-col items-center justify-center px-5 hover:bg-muted',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="w-5 h-5 mb-1" />
              <span className="text-xs">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
