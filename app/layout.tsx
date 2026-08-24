import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: "Rock Cottage",
  description: "Meals, Alice, shopping and photos for the week at the cottage.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Rock Cottage" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#2f5d50",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Cottage app on a phone — pinch-zoom stays on, but the layout never needs it.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
