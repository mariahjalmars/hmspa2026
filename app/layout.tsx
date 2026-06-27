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
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/7.2.3/css/flag-icons.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
