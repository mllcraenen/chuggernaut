import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime Google request.
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Chuggernaut",
  description: "Monolith Meet Prep v7 — Lichtstad Cup powerlifting tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${anton.variable} ${inter.variable}`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
