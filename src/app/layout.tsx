import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { Providers } from "@/components/Providers";
import { Toaster } from "@/components/ui/Toaster";

export const metadata: Metadata = {
  title: "ملوك العقارات – Property Kings",
  description:
    "لعبة تجارة عقارات أونلاين جماعية: اشترِ، ابنِ، رهّن، زايد وتبادل لتصبح ملك العقارات!",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        {/* خط عربي عبر CDN مع سلسلة بدائل محلية (لا يعطل العمل دون اتصال) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <I18nProvider>
          <Providers>{children}</Providers>
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
