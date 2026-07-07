import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
