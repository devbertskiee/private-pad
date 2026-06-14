import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { ThemeRoot } from "@/components/theme-root";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PrivatePad",
  description: "Browser-encrypted notes stored as ciphertext only.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body className="min-h-full flex flex-col">
        <ThemeRoot />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
