import type { Metadata } from "next";
import "./globals.css";
import ExperienceNav from "@/components/ExperienceNav";

export const metadata: Metadata = {
  title: "INONG",
  description: "How well do you really know each other?",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-paper">
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
          <img
            src="/logo.png"
            alt="INONG"
            className="mx-auto h-16 w-auto"
          />
          <div className="flex flex-1 flex-col">{children}</div>
          <ExperienceNav />
        </div>
      </body>
    </html>
  );
}
