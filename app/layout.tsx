import type { Metadata, Viewport } from "next";
import { Lora, DM_Sans, Playfair_Display, Caveat } from "next/font/google";
import { connection } from "next/server";
import { headers } from "next/headers";
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

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "gleaned",
  description: "Dein persönliches Lern-Journal",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icon-apple.png" }],
    shortcut: "/icon-192.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "gleaned" },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Force dynamic rendering so each request gets a fresh nonce from proxy.ts.
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="de" className={`${lora.variable} ${dmSans.variable} ${playfair.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#F3EDE3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#15100C" media="(prefers-color-scheme: dark)" />
        {/* Inline script runs synchronously before first paint — prevents FOUC.
            Nonce is required because script-src uses 'strict-dynamic', which
            ignores 'self' and 'unsafe-inline' for inline scripts. */}
        {/* suppressHydrationWarning: browsers zero out the nonce DOM attribute after
            parsing (nonce-hiding spec) so React sees nonce="" during hydration. */}
        <script suppressHydrationWarning nonce={nonce} dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("gleaned-theme")||"system",pd=window.matchMedia("(prefers-color-scheme:dark)").matches;if(t!=="system")document.documentElement.classList.add("theme-"+t);else if(pd)document.documentElement.classList.add("theme-dark");var f=localStorage.getItem("gleaned-font")||"sans",fm={sans:"var(--font-dm-sans),ui-sans-serif,system-ui,sans-serif",serif:"var(--font-lora),Georgia,serif",playfair:"var(--font-playfair),Georgia,serif",handwriting:"var(--font-caveat),cursive"};document.documentElement.style.setProperty("--font-body",fm[f]||fm.sans);document.documentElement.lang=localStorage.getItem("gleaned-lang")||"de";var tc={light:"#F3EDE3",dark:"#15100C",sepia:"#DDD0A8"},eff=t==="system"?(pd?"dark":null):t;if(eff&&tc[eff]){var m=document.createElement("meta");m.name="theme-color";m.content=tc[eff];m.dataset.dynamic="true";document.head.appendChild(m)}}catch(e){}` }} />
        <script suppressHydrationWarning nonce={nonce} src="/sw-register.js" async />
      </head>
      <body>{children}</body>
    </html>
  );
}
