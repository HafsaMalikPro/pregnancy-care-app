import { cx } from "@/lib/cx";

/**
 * Decorative botanicals from the design: leafy branches and small hearts that frame cards and
 * page corners. Always aria-hidden; they carry no information.
 */

export function LeafBranch({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 160"
      className={cx("pointer-events-none", flip && "-scale-x-100", className)}
    >
      <path d="M58 158C56 118 52 80 40 44 34 26 28 14 22 4" fill="none" stroke="#7fa585" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M55 132c-14-3-26-14-28-28 15 2 27 13 28 28z" fill="#a8c9ac" />
      <path d="M56 116c11-9 25-12 37-8-8 11-22 15-37 8z" fill="#93bb98" />
      <path d="M49 92c-14-1-27-10-31-23 15 0 28 9 31 23z" fill="#b7d4ba" />
      <path d="M48 76c9-11 22-16 35-13-6 12-20 18-35 13z" fill="#a8c9ac" />
      <path d="M40 52c-12-3-21-12-23-24 13 2 22 11 23 24z" fill="#93bb98" />
      <path d="M38 40c6-10 16-15 27-14-4 10-15 16-27 14z" fill="#b7d4ba" />
      <path d="M23 6c-4-4-3-9 1-10 3 4 2 8-1 10z" fill="#e88aa0" />
    </svg>
  );
}

export function Heart({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 22" className={cx("pointer-events-none", className)}>
      <path
        d="M12 21s-9-5.6-9-12A5 5 0 0 1 12 6a5 5 0 0 1 9 3c0 6.4-9 12-9 12z"
        fill="currentColor"
      />
    </svg>
  );
}
