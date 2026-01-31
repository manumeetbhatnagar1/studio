import { Logo } from "@/components/icons";

export default function TestLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <div className="bg-muted/30">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 md:px-6">
            <div className="flex items-center gap-2">
                <Logo className="w-8 h-8 text-primary" />
                <span className="font-headline text-2xl font-semibold text-primary">
                    DCAM Classes
                </span>
            </div>
            <div>
                <h1 className="font-headline text-xl font-semibold text-center">JEE Main Mock Test</h1>
            </div>
             <div className="w-48"></div>
        </header>
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>
    );
  }
