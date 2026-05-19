import type { Metadata } from "next";
import { Lora, DM_Sans } from "next/font/google";
import "./globals.css";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "gleaned",
  description: "Dein persönliches Lern-Journal",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "gleaned" },
  other: { "mobile-web-app-capable": "yes" },
  viewport: { width: "device-width", initialScale: 1, viewportFit: "cover" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${lora.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#F3EDE3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#15100C" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icon-apple.png" />
        {/* Apply theme class before React hydrates to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{var t=localStorage.getItem("gleaned-theme")||"system";if(t!=="system")document.documentElement.classList.add("theme-"+t)}catch(e){}`
        }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js")`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
