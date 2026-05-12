import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Docs Lens · see how agents read your documentation",
  description:
    "A free utility by EkLine. Paste any docs URL and see what Claude Code, Cursor, Perplexity, and RAG chunkers actually receive when they read your page. Deterministic, no LLMs, open methodology.",
  openGraph: {
    type: "website",
    title: "Docs Lens · see how agents read your documentation",
    description:
      "Three readings for every docs page — one for coding agents, one for answer engines, one for context windows. Free, by EkLine.",
    siteName: "Docs Lens by EkLine",
  },
  twitter: {
    card: "summary_large_image",
    title: "Docs Lens · see how agents read your docs",
    description:
      "Free utility by EkLine. Three readings per docs page — agents, answer engines, context windows. Deterministic.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Post document height to the parent so the Webflow iframe embed at
         * /docs-lens can grow to fit. No-op when not embedded. */}
        <Script id="docs-lens-iframe-resize" strategy="afterInteractive">
          {`(() => {
            if (window.parent === window) return;
            let last = 0;
            const post = () => {
              const h = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight
              );
              if (h === last) return;
              last = h;
              window.parent.postMessage({ type: 'resize', height: h }, '*');
            };
            new ResizeObserver(post).observe(document.body);
            window.addEventListener('load', post);
          })();`}
        </Script>
      </body>
    </html>
  );
}
