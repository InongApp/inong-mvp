import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthBar from "@/components/AuthBar";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import InstallPrompt from "@/components/InstallPrompt";
import PushOptIn from "@/components/PushOptIn";

export const metadata: Metadata = {
  title: "INONG",
  description: "How well do you really know each other?",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "INONG",
  },
};

export const viewport: Viewport = {
  themeColor: "#E8262A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-paper">
        <RegisterServiceWorker />
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
          <AuthBar />
          <img
            src="/logo.png"
            alt="INONG"
            className="mx-auto h-24 w-auto"
          />
          <p className="mt-1 text-center text-xs uppercase tracking-widest text-mute">
            Deepen your relationships
          </p>
          <div className="mt-4 flex flex-1 flex-col">
            <InstallPrompt />
            <PushOptIn />
            {children}
          </div>
          <footer className="mt-8 pb-2 text-center text-[10px] leading-relaxed text-mute">
            A digital product of Zero2Billionaires Amavulandlela (Pty) Ltd
          </footer>
        </div>
      </body>
    </html>
  );
}

