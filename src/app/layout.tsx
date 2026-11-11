import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import { SessionProvider } from "@/components/session-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

/*
 * One sans-serif family for the whole site. Figtree is a free stand-in for Aeonik (a licensed
 * CoType font). To use Aeonik, add its licensed .woff2 files under src/fonts/aeonik/, load them
 * with next/font/local using variable "--font-body", and remove this Figtree block.
 */
const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const description =
  "Week-by-week pregnancy guidance reviewed by clinicians, with a private symptom journal, checklist and reminders.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Pregnancy Care: your pregnancy, week by week", template: "%s | Pregnancy Care" },
  description,
  applicationName: "Pregnancy Care",
  openGraph: {
    type: "website",
    siteName: "Pregnancy Care",
    title: "Pregnancy Care: your pregnancy, week by week",
    description,
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#fff5f7",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <MotionProvider>
          <SessionProvider>{children}</SessionProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
