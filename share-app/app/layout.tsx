import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Music — Share",
  description: "Listen to AI-generated music on AIMusic",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
