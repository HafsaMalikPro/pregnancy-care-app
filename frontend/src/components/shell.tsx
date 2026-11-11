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
  ShieldUser,
  UserRound,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
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
    <div className={cx("mx-auto px-4 py-10 sm:py-14", wide ? "max-w-6xl" : "max-w-5xl", className)}>
      {children}
    </div>
  );
}

const isActive = (pathname: string, item: Pick<NavItem, "href" | "also">) =>
  [item.href, ...(item.also ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-2 rounded-full font-sans text-lg font-extrabold tracking-tight text-heading sm:gap-2.5 sm:text-xl"
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
        <span className="mt-1 block font-sans text-[0.68rem] font-semibold tracking-normal text-clay-strong max-sm:hidden">
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
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-3 px-4">
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
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-8">
              <span>Guest mode: your data stays on this browser only.</span>
              <Link href="/signup" className="font-semibold underline">
                Create an account to keep it
              </Link>
            </div>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pt-8 lg:pb-12 lg:pt-0">
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
      className="grid size-10 place-items-center rounded-full bg-linear-to-br from-rose to-clay text-sm font-bold text-white shadow-soft ring-2 ring-white"
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
    <p className="mx-auto max-w-6xl px-8 pb-8 text-xs leading-relaxed text-muted">
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

export function SiteFooter() {
  const links = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/contact", label: "Contact" },
  ];
  return (
    <footer className="relative mt-auto">
      <Sprig className="absolute -top-14 left-6 hidden sm:block" />
      <Sprig className="absolute -top-14 right-6 hidden -scale-x-100 sm:block" />
      <div className="border-t border-line/70 bg-card/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-8 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <Logo />
          <div className="flex flex-col items-center gap-3">
            <nav aria-label="Footer">
              <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                {links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-muted hover:text-clay-strong hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="text-xs text-muted">
              © {new Date().getFullYear()} Pregnancy Care. All rights reserved.
            </p>
          </div>
          <Link
            href="/contact"
            aria-label="Contact us"
            className="grid size-10 place-items-center rounded-full bg-clay-soft text-clay-strong transition hover:bg-clay hover:text-white"
          >
            <Heart className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="border-t border-line/70">
          <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs leading-relaxed text-muted">
            Pregnancy Care offers general information, not medical advice, diagnosis or
            treatment. Always follow your midwife or doctor. If you think you or your baby may
            be in danger, call your local emergency number now.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Small decorative leaf-and-bud sprig used above the footer. */
function Sprig({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 60 60" className={cx("size-14", className)}>
      <path d="M30 58C30 40 28 24 22 10" fill="none" stroke="#80a987" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 44c-8-2-14-8-15-15 8 1 14 7 15 15z" fill="#a9c8ad" />
      <path d="M28 32c6-4 13-5 18-2-4 5-11 6-18 2z" fill="#a9c8ad" />
      <path d="M22 10c-3-5-1-9 3-9 2 4 1 8-3 9z" fill="#e88aa0" />
      <path d="M40 30c-1-6 2-10 6-10 1 5-2 9-6 10z" fill="#f2a9b9" />
    </svg>
  );
}
