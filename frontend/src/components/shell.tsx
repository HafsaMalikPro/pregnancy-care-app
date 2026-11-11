"use client";

import {
  Baby,
  BookOpen,
  ChevronDown,
  Dumbbell,
  Heart,
  HeartHandshake,
  HeartPulse,
  Hospital,
  House,
  LifeBuoy,
  LogOut,
  Menu,
  Milk,
  Settings,
  ShieldCheck,
  ShieldUser,
  Stethoscope,
  UserRound,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { SOCIAL_LINKS } from "@/lib/site";
import { useSession } from "./session-provider";
import { Alert, ButtonLink, Loading, cx } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other path prefixes that count as this section. */
  also?: string[];
}

// The dashboard's own tools (daily plan, checklist, reminders) count as Dashboard.
const APP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: House, also: ["/tools", "/checklist", "/reminders"] },
  { href: "/timeline", label: "My Pregnancy", icon: Baby, also: ["/journey"] },
  { href: "/nutrition", label: "Meal Plan", icon: Utensils },
  { href: "/exercise", label: "Exercise Plan", icon: Dumbbell },
  { href: "/journal", label: "Mother's Health", icon: HeartPulse },
  { href: "/weeks", label: "Baby Development", icon: Heart },
  { href: "/baby-care", label: "Baby Care", icon: Milk },
  { href: "/birth-and-postpartum", label: "Birth Preparation", icon: Hospital },
  { href: "/postpartum", label: "Postpartum Care", icon: HeartHandshake },
  { href: "/articles", label: "Articles & Learn", icon: BookOpen, also: ["/about"] },
  { href: "/settings", label: "Settings", icon: Settings },
];

const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: ShieldUser };

/** The five destinations in the phone tab bar. */
const TAB_NAV: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: House, also: ["/checklist", "/reminders"] },
  { href: "/timeline", label: "Pregnancy", icon: Baby, also: ["/weeks", "/journey"] },
  { href: "/nutrition", label: "Meal plan", icon: Utensils, also: ["/exercise", "/baby-care"] },
  { href: "/articles", label: "Learn", icon: BookOpen },
  { href: "/settings", label: "Profile", icon: UserRound },
];

interface NavGroup {
  label: string;
  href: string;
  also?: string[];
  items?: { href: string; label: string }[];
}

/** Public navigation. Groups open a menu of real sections on that topic. */
export const PUBLIC_NAV: NavGroup[] = [
  { href: "/", label: "Home" },
  {
    href: "/journey",
    label: "Journey",
    also: ["/weeks", "/birth-and-postpartum", "/postpartum"],
    items: [
      { href: "/journey", label: "Pregnancy journey" },
      { href: "/weeks", label: "Week by week" },
      { href: "/birth-and-postpartum", label: "Birth preparation" },
      { href: "/postpartum", label: "After the birth" },
    ],
  },
  {
    href: "/nutrition",
    label: "Nutrition",
    items: [
      { href: "/nutrition", label: "Nutrition overview" },
      { href: "/nutrition#by-week", label: "What to eat by week" },
      { href: "/nutrition#careful", label: "Foods to be careful with" },
    ],
  },
  {
    href: "/exercise",
    label: "Exercise",
    items: [
      { href: "/exercise", label: "Exercise overview" },
      { href: "/exercise#by-week", label: "Movement by trimester" },
      { href: "/exercise#get-help", label: "When to stop" },
    ],
  },
  {
    href: "/baby-care",
    label: "Baby Care",
    items: [
      { href: "/baby-care", label: "Baby care overview" },
      { href: "/baby-care#checklist", label: "Preparation checklist" },
      { href: "/baby-care#tips", label: "Newborn care tips" },
    ],
  },
  {
    href: "/articles",
    label: "Learn",
    also: ["/about"],
    items: [
      { href: "/articles", label: "All articles" },
      { href: "/about", label: "About Pregnancy Care" },
    ],
  },
];

/** True inside the signed-in frame, which already pads its content. */
const InAppFrame = createContext(false);

/**
 * Width and padding for public pages. Inside the app frame (signed-in visitors reading
 * public pages) the frame already provides both.
 */
export function Container({
  wide = true,
  className,
  children,
}: {
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const inApp = useContext(InAppFrame);
  if (inApp) return <div className={className}>{children}</div>;
  return (
    <div className={cx("w-full px-4 sm:px-8 lg:px-12 xl:px-16 py-10 sm:py-14", className)}>
      {/* Pages run full width; text-only pages (wide={false}) keep a readable column. */}
      {wide ? children : <div className="max-w-4xl">{children}</div>}
    </div>
  );
}

const isActive = (pathname: string, item: Pick<NavItem, "href" | "also">) =>
  [item.href, ...(item.also ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

export function Logo({ href = "/", tone = "default" }: { href?: string; tone?: "default" | "light" }) {
  const light = tone === "light";
  return (
    <Link
      href={href}
      className={cx(
        "flex shrink-0 items-center gap-2 rounded-full font-sans text-lg font-extrabold tracking-tight sm:gap-2.5 sm:text-xl",
        light ? "text-white" : "text-heading",
      )}
    >
      <Image
        src="/assets/brand/logo-mark.png"
        alt=""
        width={141}
        height={160}
        className="h-8 w-auto sm:h-9"
      />
      <span className="whitespace-nowrap leading-none">
        Pregnancy Care
        <span
          className={cx(
            "mt-1 block font-sans text-[0.68rem] font-semibold tracking-normal max-sm:hidden",
            light ? "text-white/75" : "text-clay-strong",
          )}
        >
          Healthy Mom ♥ Happy Baby
        </span>
      </span>
    </Link>
  );
}

/**
 * Page chrome. `app` gives signed-in visitors (accounts and guests) the sidebar and phone
 * tab bar; `public` is the marketing header. `auto` picks by session. With
 * `requireSession`, visitors without a session go to /login.
 */
export function Shell({
  variant = "auto",
  requireSession = false,
  children,
}: {
  variant?: "auto" | "app" | "public";
  requireSession?: boolean;
  children: React.ReactNode;
}) {
  const { me, loading, signedOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (requireSession && !loading && !me) {
      router.replace(signedOut ? "/" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [requireSession, loading, me, signedOut, router, pathname]);

  const useApp = variant === "app" || (variant === "auto" && Boolean(me));
  const body = requireSession && (loading || !me) ? <Loading /> : children;

  if (!useApp) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <PublicHeader />
        <main id="main" className="flex-1">
          {body}
        </main>
        <SiteFooter />
      </div>
    );
  }
  return (
    <InAppFrame.Provider value={true}>
      <AppFrame>{body}</AppFrame>
    </InAppFrame.Provider>
  );
}

export function PublicHeader() {
  const { me, loading } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur">
      <SkipLink />
      <div className="flex h-18 w-full items-center justify-between gap-3 px-4 sm:px-8 lg:px-12 xl:px-16">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
          {PUBLIC_NAV.map((group) =>
            group.items ? (
              <NavMenu key={group.href} group={group} active={isActive(pathname, group)} />
            ) : (
              <Link
                key={group.href}
                href={group.href}
                aria-current={isActive(pathname, group) ? "page" : undefined}
                className={cx(
                  "rounded-full px-3 py-2 text-sm font-semibold transition",
                  isActive(pathname, group) ? "text-clay-strong" : "text-ink hover:text-clay-strong",
                )}
              >
                {group.label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          {!loading &&
            (me ? (
              <ButtonLink href="/dashboard" className="min-h-10 px-5">
                My dashboard
              </ButtonLink>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full px-3 py-2 text-sm font-semibold text-ink hover:text-clay-strong max-sm:hidden"
                >
                  Sign in
                </Link>
                <ButtonLink href="/signup" className="min-h-10 px-5 shadow-[0_8px_18px_-10px_rgb(200_64_106/0.8)]">
                  Get Started
                </ButtonLink>
              </>
            ))}
          <button
            className="grid size-10 place-items-center rounded-full hover:bg-sunk xl:hidden"
            aria-expanded={open}
            aria-controls="public-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="public-menu"
          aria-label="Main"
          className="grid max-h-[calc(100dvh-4.5rem)] gap-1 overflow-y-auto border-t border-line px-4 py-3 xl:hidden"
        >
          {PUBLIC_NAV.map((group) => (
            <div key={group.href}>
              <Link
                href={group.href}
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-3 py-2.5 font-semibold hover:bg-sunk"
              >
                {group.items ? group.items[0].label : group.label}
              </Link>
              {group.items?.slice(1).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl py-2 pl-7 pr-3 text-sm text-muted hover:bg-sunk"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          {!me && (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-2xl px-3 py-2.5 font-semibold hover:bg-sunk"
            >
              Sign in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

/** A top-level menu: a button that opens a short list of links. Closes on Escape or outside click. */
function NavMenu({ group, active }: { group: NavGroup; active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold transition",
          active || open ? "text-clay-strong" : "text-ink hover:text-clay-strong",
        )}
      >
        {group.label}
        <ChevronDown className={cx("size-3.5 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul
          id={id}
          className="absolute left-0 top-full z-40 mt-2 grid w-60 gap-0.5 rounded-2xl border border-line/70 bg-card p-2 shadow-soft"
        >
          {group.items?.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-clay-soft hover:text-clay-strong"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AppFrame({ children }: { children: React.ReactNode }) {
  const { me, linkError, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const nav = me?.kind === "user" && me.staffRole ? [...APP_NAV, ADMIN_NAV] : APP_NAV;
  const logOut = async () => {
    await signOut();
    router.push("/");
  };

  const footerLinks = (
    <>
      <Link
        href="/contact"
        onClick={() => setOpen(false)}
        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-sunk"
      >
        <LifeBuoy className="size-5" aria-hidden />
        Help & Support
      </Link>
      <button
        type="button"
        onClick={() => void logOut()}
        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-ink transition hover:bg-sunk"
      >
        <LogOut className="size-5" aria-hidden />
        {me?.kind === "anonymous" ? "Leave guest mode" : "Log Out"}
      </button>
    </>
  );

  return (
    <div className="flex min-h-full flex-1">
      <SkipLink />
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-line/70 bg-card/70 px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo href="/dashboard" />
        </div>
        <nav aria-label="App" className="mt-8 grid gap-0.5">
          {nav.map((item) => (
            <SideLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>
        <div className="mt-auto grid gap-0.5 border-t border-line/70 pt-4">{footerLinks}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line/70 bg-paper/90 px-4 backdrop-blur lg:hidden">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-2">
            <Avatar />
            <button
              className="grid size-10 place-items-center rounded-full hover:bg-sunk"
              aria-expanded={open}
              aria-controls="app-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </header>
        <div className="hidden h-16 items-center justify-end px-8 lg:flex">
          <Avatar />
        </div>
        {open && (
          <nav
            id="app-menu"
            aria-label="App"
            className="sticky top-16 z-20 grid max-h-[calc(100dvh-4rem)] gap-0.5 overflow-y-auto border-b border-line bg-paper px-4 py-3 shadow-soft lg:hidden"
          >
            {nav.map((item) => (
              <SideLink
                key={item.href}
                item={item}
                active={isActive(pathname, item)}
                onClick={() => setOpen(false)}
              />
            ))}
            <div className="mt-2 grid gap-0.5 border-t border-line/70 pt-2">{footerLinks}</div>
          </nav>
        )}

        {me?.kind === "anonymous" && (
          <div className="border-b border-line bg-plum-soft text-sm text-plum">
            <div className="flex w-full flex-wrap items-center justify-between gap-2 px-4 sm:px-8 lg:px-12 xl:px-16 py-2">
              <span>Guest mode: your data stays on this browser only.</span>
              <Link href="/signup" className="font-semibold underline">
                Create an account to keep it
              </Link>
            </div>
          </div>
        )}

        <main id="main" className="w-full flex-1 px-4 sm:px-8 lg:px-12 xl:px-16 pb-28 pt-6 sm:pt-8 lg:pb-12 lg:pt-8">
          {linkError && (
            <div className="mb-6">
              <Alert tone="warn">{linkError}</Alert>
            </div>
          )}
          {children}
        </main>
        <div className="hidden lg:block">
          <Disclaimer />
        </div>

        <nav
          aria-label="Shortcuts"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          {TAB_NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[0.7rem] font-semibold",
                  active ? "text-clay-strong" : "text-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** Initials of the signed-in person (no photos are stored), linking to their settings. */
function Avatar() {
  const { me } = useSession();
  const name = me?.kind === "user" ? (me.name ?? me.email) : null;
  const initials = name
    ? name
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("")
    : null;
  return (
    <Link
      href="/settings"
      aria-label="Profile and settings"
      className="grid size-10 place-items-center rounded-full bg-linear-to-br from-clay to-clay-strong text-sm font-bold text-on-primary shadow-soft ring-2 ring-white"
    >
      {initials ?? <UserRound className="size-5" aria-hidden />}
    </Link>
  );
}

function SideLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition",
        active ? "bg-clay-soft text-clay-strong" : "text-ink hover:bg-sunk",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:font-semibold focus:shadow-soft"
    >
      Skip to content
    </a>
  );
}

function Disclaimer() {
  return (
    <p className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 pb-8 text-xs leading-relaxed text-muted">
      Pregnancy Care offers general information, not medical advice, diagnosis or treatment.
      Always follow your midwife or doctor. If you think you or your baby may be in danger,
      call your local emergency number now.{" "}
      <Link href="/privacy" className="underline">
        Privacy
      </Link>{" "}
      ·{" "}
      <Link href="/terms" className="underline">
        Terms
      </Link>
    </p>
  );
}

const FOOTER_GROUPS = [
  {
    title: "Your pregnancy",
    links: [
      { href: "/journey", label: "Your 9-month journey" },
      { href: "/weeks", label: "Week by week" },
      { href: "/nutrition", label: "Nutrition" },
      { href: "/exercise", label: "Exercise" },
      { href: "/birth-and-postpartum", label: "Birth and after" },
      { href: "/baby-care", label: "Baby care" },
    ],
  },
  {
    title: "Help and support",
    links: [
      { href: "/#when-to-get-help", label: "When to get help" },
      { href: "/articles", label: "Articles" },
      { href: "/signup", label: "Create a free account" },
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact us" },
    ],
  },
] as const;

const LEGAL_LINKS = [
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/sitemap.xml", label: "Sitemap" },
] as const;

/** Statements about how the site works (not third-party certifications). */
const FOOTER_BADGES = [
  { icon: Stethoscope, title: "Clinically reviewed", text: "Every article is checked before it's published" },
  { icon: ShieldCheck, title: "Private by design", text: "Download or delete your data at any time" },
] as const;

/** Deep berry footer, the same in both themes: brand and social links, link groups, badges, legal bar. */
export function SiteFooter() {
  return (
    <footer className="relative mt-auto">
      <div className="bg-[#3f1835] text-white">
        <div className="grid w-full gap-10 px-4 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr] lg:px-12 xl:px-16">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/80">
              Calm, clinician-reviewed guidance for every week of your pregnancy and your
              baby&apos;s first days.
            </p>
            {SOCIAL_LINKS.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-3" aria-label="Follow us">
                {SOCIAL_LINKS.map((s) => (
                  <li key={s.network}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${s.label} (opens in a new tab)`}
                      className="grid size-12 place-items-center rounded-full border-2 border-white/80 text-white transition hover:-translate-y-0.5 hover:border-white hover:bg-white hover:text-[#3f1835]"
                    >
                      <SocialIcon network={s.network} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {FOOTER_GROUPS.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2 className="font-sans text-sm font-bold text-white">{g.title}</h2>
              <ul className="mt-4 grid gap-2.5 text-sm">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-white/80 transition hover:text-white hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <ul className="grid content-start gap-3">
            {FOOTER_BADGES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 rounded-2xl border border-white/30 p-4">
                <Icon className="mt-0.5 size-6 shrink-0 text-white" aria-hidden />
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-xs leading-relaxed text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-[#33122b]">
          <div className="w-full px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
            <nav aria-label="Legal">
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {LEGAL_LINKS.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-white/90 transition hover:text-white hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              © {new Date().getFullYear()} Pregnancy Care. Pregnancy Care offers general information,
              not medical advice, diagnosis or treatment. Always follow your midwife or doctor. If you
              think you or your baby may be in danger, call your local emergency number now.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Simplified social glyphs (24px box, filled with currentColor). */
function SocialIcon({ network }: { network: (typeof SOCIAL_LINKS)[number]["network"] }) {
  const paths: Record<typeof network, React.ReactNode> = {
    facebook: <path d="M14 8h2.5V4.5H14C11.2 4.5 9.5 6.3 9.5 9v2H7v3.5h2.5V21H13v-6.5h2.6l.6-3.5H13V9.3c0-.8.4-1.3 1-1.3z" />,
    instagram: (
      <>
        <path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5z" />
        <path d="M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
        <circle cx="17.2" cy="6.8" r="1.2" />
      </>
    ),
    tiktok: <path d="M15.5 3c.3 2.3 1.8 3.8 4.5 4v3.2c-1.6 0-3.1-.5-4.4-1.4v6.4A5.8 5.8 0 1 1 9.8 9.4v3.3a2.6 2.6 0 1 0 2.5 2.6V3z" />,
    youtube: <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15.2V8.8l5.2 3.2z" />,
    linkedin: (
      <>
        <rect x="3.5" y="9" width="3.5" height="11.5" rx=".5" />
        <circle cx="5.25" cy="5.25" r="2" />
        <path d="M10 9h3.3v1.6c.6-1 1.8-1.9 3.6-1.9 3.2 0 3.8 2.1 3.8 4.8v7h-3.5v-6.2c0-1.4-.3-2.6-1.9-2.6s-1.9 1.2-1.9 2.6v6.2H10z" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
      {paths[network]}
    </svg>
  );
}
