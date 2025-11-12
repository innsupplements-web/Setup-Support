import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Setup Support",
  description: "Geführter Kundendienst-Leitfaden"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
