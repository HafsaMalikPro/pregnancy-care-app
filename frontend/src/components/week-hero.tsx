import { WombArt } from "./art";

export const trimesterOf = (week: number) => (week <= 13 ? 1 : week <= 27 ? 2 : 3);
export const TRIMESTER_NAMES = {
  1: "First trimester",
  2: "Second trimester",
  3: "Third trimester",
} as const;

/** The rose banner at the top of a week: illustration, week number and trimester. */
export function WeekHero({
  week,
  title,
  summary,
  badge,
  children,
  priority = false,
}: {
  week: number;
  title?: string;
  summary?: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  priority?: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-linear-to-r from-rose to-clay text-white shadow-soft">
      <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,15rem)_1fr]">
        <WombArt
          week={week}
          size={240}
          priority={priority}
          className="mx-auto -mb-6 mt-4 w-48 drop-shadow-xl sm:my-0 sm:-ml-6 sm:w-60"
        />
        <div className="relative px-6 pb-7 pt-4 sm:py-8 sm:pr-8">
          <p className="font-semibold text-white/85">{TRIMESTER_NAMES[trimesterOf(week)]}</p>
          <h1 className="font-sans text-5xl font-bold tracking-tight text-white sm:text-6xl">
            Week {week}
          </h1>
          {title && title !== `Week ${week}` && <p className="mt-2 font-sans text-xl text-white">{title}</p>}
          {summary && <p className="mt-2 max-w-xl leading-relaxed text-white/90">{summary}</p>}
          {badge && <div className="mt-4">{badge}</div>}
          {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}
