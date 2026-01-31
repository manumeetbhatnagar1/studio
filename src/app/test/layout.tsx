
export default function TestLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <div className="bg-muted/30 min-h-screen">
        <main className="min-h-screen">{children}</main>
      </div>
    );
  }
