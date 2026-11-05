import type { Metadata } from "next";
import { Shell } from "@/components/shell";

// Personal pages: never indexed, and rendered only in the browser with the visitor's session.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <Shell requireSession>{children}</Shell>;
}
