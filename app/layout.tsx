import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const description = "Run a Model UN committee online: roll call, speakers' list, caucuses, resolutions and voting, with live voice. Or practice solo with an AI Chair and four AI delegates.";

// The share image comes from app/opengraph-image.png and app/twitter-image.png.
export const metadata: Metadata = {
  metadataBase: new URL("https://mun.ouratlas.co.in"),
  title: "MUN Chamber",
  description,
  openGraph: { title: "MUN Chamber", description, url: "/", siteName: "MUN Chamber", type: "website" },
  twitter: { card: "summary_large_image", title: "MUN Chamber", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Baloo+2:wght@700;800&family=Figtree:wght@400;500;600;700;800&family=Source+Serif+4:wght@500;600;700&family=Cinzel:wght@600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Orbitron:wght@600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">
        {children}
        {/* Vercel visitor analytics and real-user performance; they do nothing outside Vercel. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
