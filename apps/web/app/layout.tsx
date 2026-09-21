import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/register-service-worker";

// The app shell (architecture §8 M0 U). Fonts: the prototype's tokens name
// Archivo (app/theme.css); loading it is the first screen order's decision.
export const metadata: Metadata = {
  title: "Wax Works",
  description: "Point of sale and inventory for independent record stores.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
