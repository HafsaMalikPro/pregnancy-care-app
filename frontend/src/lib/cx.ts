/** Joins class names, skipping falsy ones. Usable from server and client components. */
export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");
