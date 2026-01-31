import Link from "next/link";
import Image from "next/image";
import {
  BookOpen,
  ClipboardList,
  MessageSquare,
  Target,
  Video,
  ArrowRight
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Button } from "./ui/button";

const links = [
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
    title: "Mock Tests",
    href: "/mock-tests",
    description: "Simulate exam conditions.",
    icon: Target,
    imageId: "mock-tests",
  },
  {
    title: "Doubts",
    href: "/doubts",
    description: "Get your questions answered.",
    icon: MessageSquare,
    imageId: "doubt-resolution",
  },
];

export default function QuickLinks() {
  return (
    <div>
      <h2 className="font-headline text-2xl font-semibold mb-4">Quick Access</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => {
          const image = PlaceHolderImages.find((img) => img.id === link.imageId);
          return (
            <Link href={link.href} key={link.title} className="group">
              <Card className="h-full overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
                <div className="relative h-40 w-full overflow-hidden">
                    {image && (
                        <Image
                        src={image.imageUrl}
                        alt={link.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        data-ai-hint={image.imageHint}
                        />
                    )}
                </div>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <link.icon className="w-6 h-6 text-primary" />
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
