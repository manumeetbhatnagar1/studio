'use client';

import Link from "next/link";
import Image from "next/image";
import {
  BookOpen,
  ClipboardList,
  MessageSquare,
  Video,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import { useMemo } from "react";
import { Skeleton } from "./ui/skeleton";
import type { LucideIcon } from "lucide-react";

// The local fallback data
const localLinks = [
  {
    title: "Content",
    href: "/content",
    description: "Access video lectures and notes.",
    icon: BookOpen,
    imageId: "content-delivery",
  },
  {
    title: "Live Classes",
    href: "/live-classes",
    description: "Join scheduled interactive classes.",
    icon: Video,
    imageId: "live-classes",
  },
  {
    title: "Practice",
    href: "/practice",
    description: "Hone your skills with question banks.",
    icon: ClipboardList,
    imageId: "practice-questions",
  },
  {
    title: "Doubts",
    href: "/doubts",
    description: "Get your questions answered by experts.",
    icon: MessageSquare,
    imageId: "doubt-resolution",
  },
];

// A map to dynamically select icons based on string names from Firestore
const iconMap: { [key: string]: LucideIcon } = {
  BookOpen,
  Video,
  ClipboardList,
  MessageSquare,
};

type DashboardLink = {
    id: string;
    title: string;
    description: string;
    href: string;
    icon: string | LucideIcon; // string from DB, component for local
    imageUrl: string;
    imageHint?: string;
}

export default function QuickLinks() {
  const firestore = useFirestore();
  const linksQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, "dashboard_links"), orderBy("order")) : null),
    [firestore]
  );
  const { data: dbLinks, isLoading } = useCollection<DashboardLink>(linksQuery);

  const linksToRender: DashboardLink[] = useMemo(() => {
    if (dbLinks && dbLinks.length > 0) {
      return dbLinks;
    }
    // Fallback to local data
    return localLinks.map(link => {
      const image = PlaceHolderImages.find(img => img.id === link.imageId);
      return {
        id: link.title,
        ...link,
        imageUrl: image?.imageUrl || '',
        imageHint: image?.imageHint,
      };
    });
  }, [dbLinks]);

  if (isLoading) {
    return (
      <div>
        <h2 className="font-headline text-2xl font-semibold mb-4">Quick Access</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[300px] w-full" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-headline text-2xl font-semibold mb-4">Quick Access</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {linksToRender.map((link) => {
          const IconComponent = typeof link.icon === 'string' ? iconMap[link.icon] : link.icon;
          return (
            <Link href={link.href} key={link.id} className="group">
              <Card className="h-full overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
                <div className="relative h-40 w-full overflow-hidden">
                    {link.imageUrl && (
                        <Image
                        src={link.imageUrl}
                        alt={link.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        data-ai-hint={link.imageHint}
                        />
                    )}
                </div>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {IconComponent && <IconComponent className="w-6 h-6 text-primary" />}
                      <span className="font-headline">{link.title}</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                  <CardDescription>{link.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
