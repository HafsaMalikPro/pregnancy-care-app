import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shell";
import { AuthAside } from "./auth-aside";

export const metadata: Metadata = { robots: { index: false } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[1fr_1.1fr]">
      <AuthAside />
      <main id="main" className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Link href="/" className="text-sm font-semibold text-muted hover:text-clay-strong">
            Back to home
          </Link>
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-10">{children}</div>
      </main>
    </div>
  );
}
