import type { Metadata } from "next";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "World Cup spá - Sand Fjölskyldan",
  description: "World Cup 2026 spáleikur Sand fjölskyldunnar."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="is">
      <body>{children}</body>
    </html>
  );
}
