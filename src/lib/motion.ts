/**
 * Motion tokens (seconds, for Motion) mirroring the CSS custom properties in globals.css.
 * Durations are short on purpose: motion confirms what changed, it never makes anyone wait.
 */
export const DURATION = {
  fast: 0.12,
  base: 0.22,
  slow: 0.42,
  count: 0.9,
  /** One full breath (in + out) for the contraction timer's guide circle. */
  breath: 8,
} as const;

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Route change: fade with a slight rise. Reduced motion: opacity only. */
export const pageVariants = (reduced: boolean) => ({
  initial: { opacity: 0, y: reduced ? 0 : 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
});

/** Lists and card grids that reveal one after another as they scroll into view. */
export const STAGGER_SECONDS = 0.05;
export const itemVariants = (reduced: boolean) => ({
  hidden: { opacity: 0, y: reduced ? 0 : 12 },
  shown: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
});

/** Eased value between 0 and 1 for count-up animations (easeOutCubic). */
export const easeOutCubic = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
