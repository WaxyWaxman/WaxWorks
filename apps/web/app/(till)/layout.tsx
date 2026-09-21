"use client";
// Till screens are client components (A-2). Every screen under this group inherits it.
export default function TillLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
