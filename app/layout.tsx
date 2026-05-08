import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Property Tracker",
  description: "Listings + Dashboard + Income",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#05070A] text-white">
        <TopNav />
        {children}
      </body>
    </html>
  );
}