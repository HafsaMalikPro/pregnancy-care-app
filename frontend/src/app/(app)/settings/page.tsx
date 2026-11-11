"use client";

import {
  Baby,
  ChevronLeft,
  ChevronRight,
  Crown,
  KeyRound,
  ShieldCheck,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSession } from "@/components/session-provider";
import { Card, Loading, PageHeader, cx } from "@/components/ui";
import {
  AccountSection,
  ConsentSection,
  MembershipSection,
  PrivacySection,
  ProfileSection,
} from "./account-sections";
import { PregnancySection } from "./pregnancy-section";

const SECTIONS: Record<string, { label: string; hint: string; icon: LucideIcon; Section: () => React.ReactNode }> = {
  pregnancy: { label: "Pregnancy information", hint: "Due date, dating and details", icon: Baby, Section: PregnancySection },
  profile: { label: "About you", hint: "Time zone, diet and activity", icon: UserRound, Section: ProfileSection },
  account: { label: "Account and security", hint: "Name, password, devices, 2-step", icon: KeyRound, Section: AccountSection },
  consent: { label: "Health data and consent", hint: "What we may store", icon: ShieldCheck, Section: ConsentSection },
  privacy: { label: "Privacy and data", hint: "Download or delete", icon: Trash2, Section: PrivacySection },
  membership: { label: "Membership", hint: "Free or premium", icon: Crown, Section: MembershipSection },
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { me } = useSession();
  const tab = useSearchParams().get("tab");
  const active = tab && tab in SECTIONS ? tab : null;
  const name = me?.kind === "user" ? me.name || me.email : "Guest";
  const initials = name
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  const menu = (
    <nav aria-label="Settings" className={cx("grid content-start gap-4", active && "hidden lg:grid")}>
      <Card className="flex items-center gap-4">
        <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-clay-soft font-sans text-xl font-semibold text-clay-strong">
          {initials || "G"}
        </span>
        <div className="min-w-0">
          <p className="truncate font-sans text-lg font-semibold text-heading">{name}</p>
          <p className="truncate text-sm text-muted">
            {me?.kind === "user" ? me.email : "Guest mode on this browser"}
          </p>
        </div>
      </Card>
      <Card className="p-2 sm:p-2">
        <ul>
          {Object.entries(SECTIONS).map(([key, { label, hint, icon: Icon }]) => (
            <li key={key}>
              <Link
                href={`/settings?tab=${key}`}
                scroll={false}
                aria-current={active === key ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-2xl px-3 py-3 transition",
                  active === key ? "bg-clay-soft" : "hover:bg-sunk",
                )}
              >
                <Icon className="size-5 shrink-0 text-clay-strong" aria-hidden />
                <span className="flex-1">
                  <span className="block font-semibold text-heading">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <p className="px-2 text-sm text-muted">
        Notification settings aren&apos;t available yet. Your{" "}
        <Link href="/reminders" className="font-semibold text-clay-strong underline">reminders</Link>{" "}
        are saved, but not yet delivered.
      </p>
    </nav>
  );

  const Section = active ? SECTIONS[active].Section : SECTIONS.pregnancy.Section;
  return (
    <div>
      <PageHeader title="Profile and settings" />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        {menu}
        <div className={cx("min-w-0", !active && "hidden lg:block")}>
          {active && (
            <Link href="/settings" scroll={false} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-clay-strong lg:hidden">
              <ChevronLeft className="size-4" aria-hidden /> All settings
            </Link>
          )}
          <h2 className="mb-4 font-sans text-2xl font-bold">
            {SECTIONS[active ?? "pregnancy"].label}
          </h2>
          <Section />
        </div>
      </div>
    </div>
  );
}
