"use client";

import { AnimatePresence, LazyMotion, MotionConfig, useInView, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { DURATION, EASE_IN_OUT, EASE_OUT, STAGGER_SECONDS, easeOutCubic, itemVariants, pageVariants } from "@/lib/motion";
import { cx } from "@/lib/cx";

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

interface MotionPrefs {
  /** The visitor's in-app "reduce motion" setting (profile), on top of the OS setting. */
  profileReduced: boolean;
  setProfileReduced: (v: boolean) => void;
}
const MotionPrefsContext = createContext<MotionPrefs>({ profileReduced: false, setProfileReduced: () => {} });

/**
 * Animation engine (loaded lazily) plus reduced-motion handling. Motion components fall back
 * to instant or opacity-only changes when the OS or the profile asks for reduced motion.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [profileReduced, setProfileReduced] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(profileReduced);
  }, [profileReduced]);
  return (
    <MotionPrefsContext.Provider value={{ profileReduced, setProfileReduced }}>
      <LazyMotion features={loadFeatures} strict>
        <MotionConfig reducedMotion={profileReduced ? "always" : "user"}>{children}</MotionConfig>
      </LazyMotion>
    </MotionPrefsContext.Provider>
  );
}

export const useMotionPrefs = () => useContext(MotionPrefsContext);

/** True when motion should be reduced (OS setting or profile setting). */
export function useReduced(): boolean {
  const os = useReducedMotion();
  return Boolean(os) || useContext(MotionPrefsContext).profileReduced;
}

/** Fades and lifts the page content in on every route change. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReduced();
  const v = pageVariants(reduced);
  return (
    <m.div key={pathname} initial={v.initial} animate={v.animate}>
      {children}
    </m.div>
  );
}

/** A list whose items reveal one after another the first time it scrolls into view. */
export function StaggerList({
  as = "ul",
  className,
  children,
}: {
  as?: "ul" | "ol" | "div";
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = as === "ul" ? m.ul : as === "ol" ? m.ol : m.div;
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.1 }}
      variants={{ shown: { transition: { staggerChildren: STAGGER_SECONDS } } }}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({
  as = "li",
  className,
  children,
  layoutId,
}: {
  as?: "li" | "div";
  className?: string;
  children: React.ReactNode;
  layoutId?: string;
}) {
  const reduced = useReduced();
  const Tag = as === "li" ? m.li : m.div;
  return (
    <Tag className={className} variants={itemVariants(reduced)} layoutId={layoutId}>
      {children}
    </Tag>
  );
}

/** Counts up from 0 to `value` once it is on screen. Screen readers get the final value only. */
export function CountUp({ value, className, suffix = "" }: { value: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReduced();
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / (DURATION.count * 1000);
      setShown(Math.round(easeOutCubic(t) * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden>
        {shown}
        {suffix}
      </span>
      <span className="sr-only">
        {value}
        {suffix}
      </span>
    </span>
  );
}

/**
 * Progress ring that draws itself to `value` (0-100). The outer track can show a second,
 * thinner arc (e.g. the trimester's share) via `inner`.
 */
export function AnimatedRing({
  value,
  inner,
  size = 168,
  label,
  children,
}: {
  value: number;
  inner?: number;
  size?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const reduced = useReduced();
  const pct = Math.max(0, Math.min(100, value));
  const r = 44;
  const c = 2 * Math.PI * r;
  const r2 = 34;
  const c2 = 2 * Math.PI * r2;
  const innerPct = inner === undefined ? null : Math.max(0, Math.min(100, inner));
  const transition = reduced ? { duration: 0 } : { duration: DURATION.count, ease: EASE_OUT };
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--peach-soft)" strokeWidth="7" />
        <m.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduced ? c * (1 - pct / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={transition}
        />
        {innerPct !== null && (
          <>
            <circle cx="50" cy="50" r={r2} fill="none" stroke="var(--sage-soft)" strokeWidth="4" />
            <m.circle
              cx="50"
              cy="50"
              r={r2}
              fill="none"
              stroke="var(--sage-fill)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={c2}
              initial={{ strokeDashoffset: reduced ? c2 * (1 - innerPct / 100) : c2 }}
              animate={{ strokeDashoffset: c2 * (1 - innerPct / 100) }}
              transition={reduced ? { duration: 0 } : { ...transition, delay: 0.15 }}
            />
          </>
        )}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/**
 * A round check that springs when ticked: the circle fills, the tick draws itself and the
 * whole mark gives a small press-and-release scale, like a light haptic tap.
 */
export function CheckMark({ checked, className }: { checked: boolean; className?: string }) {
  const reduced = useReduced();
  return (
    <m.span
      aria-hidden
      className={cx(
        "grid size-6 shrink-0 place-items-center rounded-full border-2",
        checked ? "border-sage bg-sage text-card" : "border-line bg-card",
        className,
      )}
      animate={checked && !reduced ? { scale: [1, 0.82, 1.12, 1] } : { scale: 1 }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT }}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <m.path
          d="M5 12.5l4.2 4.2L19 7"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE_OUT, delay: 0.05 }}
        />
      </svg>
    </m.span>
  );
}

const CONFETTI_COLORS = ["var(--peach)", "var(--sage-fill)", "var(--lavender-fill)", "var(--primary)"];

/** A short, small burst shown once when a whole day's plan is complete. Never with reduced motion. */
export function Confetti({ fire }: { fire: boolean }) {
  const reduced = useReduced();
  const id = useId();
  if (reduced) return null;
  return (
    <AnimatePresence>
      {fire && (
        <m.div key={id} aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" exit={{ opacity: 0 }}>
          {Array.from({ length: 18 }, (_, i) => {
            const angle = (i / 18) * Math.PI * 2;
            const dist = 70 + (i % 4) * 18;
            return (
              <m.span
                key={i}
                className="absolute left-1/2 top-1/2 block size-2 rounded-[2px]"
                style={{ background: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
                animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist + 30, opacity: 0, rotate: 180 + i * 20, scale: 0.6 }}
                transition={{ duration: 1.1, ease: EASE_OUT }}
              />
            );
          })}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Calm breathing guide: four seconds in, four seconds out. Static with reduced motion. */
export function BreathingCircle({ active, children }: { active: boolean; children?: React.ReactNode }) {
  const reduced = useReduced();
  const moving = active && !reduced;
  return (
    <div className="relative grid size-64 place-items-center sm:size-72">
      <m.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-lavender-soft"
        animate={moving ? { scale: [0.82, 1, 0.82] } : { scale: 0.92 }}
        transition={moving ? { duration: DURATION.breath, ease: EASE_IN_OUT, repeat: Infinity } : { duration: DURATION.base }}
      />
      <m.span
        aria-hidden
        className="absolute inset-8 rounded-full bg-lavender-fill/50"
        animate={moving ? { scale: [0.86, 1, 0.86] } : { scale: 0.94 }}
        transition={moving ? { duration: DURATION.breath, ease: EASE_IN_OUT, repeat: Infinity, delay: 0.2 } : { duration: DURATION.base }}
      />
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** A large round tap target with a ripple from the press point. */
export function RippleButton({
  onPress,
  disabled,
  className,
  children,
  ...aria
}: {
  onPress: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const reduced = useReduced();
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const next = useRef(0);
  return (
    <m.button
      type="button"
      {...aria}
      disabled={disabled}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      onClick={(e) => {
        if (!reduced) {
          const rect = e.currentTarget.getBoundingClientRect();
          // Keyboard presses report 0,0: ripple from the centre instead.
          const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
          const y = e.clientY ? e.clientY - rect.top : rect.height / 2;
          const id = next.current++;
          setRipples((r) => [...r, { id, x, y }]);
        }
        onPress();
      }}
      className={cx("relative overflow-hidden", className)}
    >
      {ripples.map((r) => (
        <m.span
          key={r.id}
          aria-hidden
          className="pointer-events-none absolute size-10 rounded-full bg-on-primary/35"
          style={{ left: r.x - 20, top: r.y - 20 }}
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 9, opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          onAnimationComplete={() => setRipples((all) => all.filter((x) => x.id !== r.id))}
        />
      ))}
      <span className="relative">{children}</span>
    </m.button>
  );
}

/** A number that ticks upward (slides in from below) when it changes. */
export function TickNumber({ value, className }: { value: number; className?: string }) {
  const reduced = useReduced();
  return (
    <span className={cx("relative inline-grid overflow-hidden tabular-nums", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={value}
          initial={reduced ? { opacity: 0 } : { y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: "-70%", opacity: 0 }}
          transition={{ duration: reduced ? DURATION.fast : DURATION.base, ease: EASE_OUT }}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** Inline message that slides in (validation errors, saved confirmations). */
export function SlideIn({ show, children, className }: { show: boolean; children: React.ReactNode; className?: string }) {
  const reduced = useReduced();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          className={className}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, height: reduced ? "auto" : 0 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

export { AnimatePresence, m };
