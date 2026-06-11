import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HM Spaa 2026",
  description: "A private World Cup 2026 prediction game."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
