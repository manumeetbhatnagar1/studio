'use client';

import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, LogOut, User } from "lucide-react";
import { useAuth, useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from "@/firebase";
import { Skeleton } from "./ui/skeleton";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { collection, doc, query, orderBy, limit } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';

type DashboardHeaderProps = {
  title: string;
};

type Notification = {
  id: string;
  title: string;
  message: string;
  href: string;
  createdAt: { toDate: () => Date } | null;
};

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
};

function NotificationsDropdown() {
  const firestore = useFirestore();
  const notificationsQuery = useMemoFirebase(
      () => firestore ? query(collection(firestore, 'notifications'), orderBy('createdAt', 'desc'), limit(5)) : null,
      [firestore]
  );
  const { data: notifications, isLoading } = useCollection<Notification>(notificationsQuery);

  return (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full relative">
                <Bell className="h-5 w-5" />
                {!isLoading && notifications && notifications.length > 0 && (
                    <span className="absolute top-0 right-0 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                )}
                <span className="sr-only">Toggle notifications</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 md:w-96">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isLoading ? (
                <div className="p-2">
                    <Skeleton className="h-16 w-full" />
                </div>
            ) : notifications && notifications.length > 0 ? (
                <div className="flex flex-col-reverse">
                    {notifications.map(n => (
                        <DropdownMenuItem key={n.id} asChild className="cursor-pointer">
                            <Link href={n.href} className="flex flex-col items-start gap-1 p-2">
                                <p className="font-semibold">{n.title}</p>
                                <p className="text-sm text-muted-foreground">{n.message}</p>
                                <p className="text-xs text-muted-foreground">
                                  {n.createdAt ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                                </p>
                            </Link>
                        </DropdownMenuItem>
                    ))}
                </div>
            ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                    You have no new notifications.
                </div>
            )}
        </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardHeader({ title }: DashboardHeaderProps) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!user?.uid || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);

  const handleLogout = () => {
    signOut(auth);
  };

  const getInitials = (name?: string | null) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('');
  }

  const profileImageUrl = userProfile?.photoURL || user?.photoURL || undefined;
  const profileDisplayName =
    `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || user?.displayName || 'User';

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <SidebarTrigger className="md:hidden" />
      <h1 className="font-headline text-2xl font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-4">
        <NotificationsDropdown />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              {isUserLoading ? (
                <Skeleton className="h-10 w-10 rounded-full" />
              ) : user ? (
                <Avatar className="h-10 w-10">
                  {profileImageUrl && (
                    <AvatarImage src={profileImageUrl} alt={profileDisplayName} />
                  )}
                  <AvatarFallback>{getInitials(profileDisplayName)}</AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-10 w-10">
                    <AvatarFallback><User className="h-5 w-5"/></AvatarFallback>
                </Avatar>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {user ? (
              <>
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profileDisplayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </>
            ) : (
                <DropdownMenuItem asChild>
                    <Link href="/login">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log in</span>
                    </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
