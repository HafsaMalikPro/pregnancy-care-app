import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import { SessionProvider } from "@/components/session-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const body = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
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
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
