'use client';
import MainSidebar from "@/components/main-sidebar";
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from "@/components/ui/sidebar";
import { useUser } from "@/firebase";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import BottomNav from "@/components/bottom-nav";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; 
  }
  
  // These pages have their own fullscreen layouts and should not be nested in the main sidebar/nav layout.
  if (pathname.startsWith('/chat/direct/') || pathname.startsWith('/practice/session')) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <MainSidebar />
      </Sidebar>
      <SidebarInset>
        <div className="pb-16 md:pb-0 h-full">
            {children}
        </div>
        <BottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
