import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { isDevAuth } from "@/lib/auth/mode";
import { preloadScript } from "@/lib/reading/prefs";
import "./globals.css";

// Reading serif for prose; mono for the "apparatus" (numbering, labels, notes, chrome).
const serif = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scholia",
  description: "Text annotation app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tree = (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply stored reading prefs to CSS vars before first paint (next-themes
            pattern) so a customized reader never flashes the defaults. */}
        <script dangerouslySetInnerHTML={{ __html: preloadScript() }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );

  // ClerkProvider throws without a publishable key, so omit it in dev-bypass mode.
  return isDevAuth() ? tree : <ClerkProvider>{tree}</ClerkProvider>;
}
