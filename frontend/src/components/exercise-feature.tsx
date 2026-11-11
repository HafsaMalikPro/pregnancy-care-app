"use client";

import { CalendarDays, Clock3, Gauge, Play, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { UnreviewedNote } from "@/components/planning-panels";
import { cx } from "@/components/ui";
import type { Activity } from "@/lib/types";

/*
 * The featured-exercise card and "Other exercises" row from the Exercise & Wellness design,
 * built from the published activity library. Duration and intensity are shown only when the
 * content sets them.
 */

/** Photos (Unsplash License) where one fits the activity; calm illustrations otherwise. */
const ART: Record<string, { src: string; alt: string; photo: boolean }> = {
  walking: { src: "/assets/photos/walking.jpg", alt: "A pregnant woman walking in a park", photo: true },
  yoga: { src: "/assets/photos/yoga.jpg", alt: "A woman sitting cross-legged on a yoga mat", photo: true },
  stretching: { src: "/assets/articles/photo-exercise.jpg", alt: "A woman stretching on a mat", photo: true },
  mobility: { src: "/assets/illustrations/topic-movement.svg", alt: "", photo: false },
  posture: { src: "/assets/illustrations/topic-movement.svg", alt: "", photo: false },
  pelvic_floor: { src: "/assets/illustrations/topic-care.svg", alt: "", photo: false },
  breathing: { src: "/assets/illustrations/topic-wellbeing.svg", alt: "", photo: false },
  relaxation: { src: "/assets/illustrations/topic-sleep.svg", alt: "", photo: false },
};
const art = (a: Activity) => ART[a.sections.type] ?? ART.mobility;

const TRIMESTER_LABEL = (t: number[]) => (t.length === 3 ? "All" : t.map((n) => `Trimester ${n}`).join(", "));

export function ExerciseFeature({ activities }: { activities: Activity[] }) {
  const initial = activities.find((a) => a.sections.type === "yoga") ?? activities[0];
  const [slug, setSlug] = useState(initial?.slug);
  const [started, setStarted] = useState(false);
  const current = activities.find((a) => a.slug === slug) ?? initial;

  if (!current) return <p className="text-muted">No activities are published for this stage yet.</p>;
  const s = current.sections;
  const picture = art(current);
  const others = activities.filter((a) => a.slug !== current.slug);

  return (
    <div className="grid gap-6">
      <section className="grid overflow-hidden rounded-3xl border border-white/80 bg-card shadow-soft md:grid-cols-[1.1fr_1fr]">
        <div className={cx("relative min-h-64", !picture.photo && "bg-blush")}>
          <Image
            src={picture.src}
            alt={picture.alt}
            fill
            sizes="(min-width: 768px) 34rem, 100vw"
            className={picture.photo ? "object-cover" : "object-contain p-10"}
          />
        </div>
        <div className="p-6 sm:p-8">
          <UnreviewedNote review={current.review} />
          <h2 className="mt-2 font-sans text-2xl font-extrabold tracking-tight">{current.title}</h2>
          <p className="mt-2 leading-relaxed text-muted">{current.summary}</p>
          <dl className="mt-5 grid gap-2.5 text-sm">
            {s.durationMinutes && (
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-clay-strong" aria-hidden />
                <dt className="font-bold text-heading">Duration:</dt>
                <dd className="text-muted">{s.durationMinutes} min</dd>
              </div>
            )}
            {s.intensity && (
              <div className="flex items-center gap-2">
                <Gauge className="size-4 text-clay-strong" aria-hidden />
                <dt className="font-bold text-heading">Intensity:</dt>
                <dd className="capitalize text-muted">{s.intensity}</dd>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-clay-strong" aria-hidden />
              <dt className="font-bold text-heading">Trimester:</dt>
              <dd className="text-muted">
                {TRIMESTER_LABEL(s.trimesters)}
                {s.fromWeek ? `, from week ${s.fromWeek}` : ""}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            aria-expanded={started}
            aria-controls="exercise-steps"
            onClick={() => setStarted(!started)}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-linear-to-b from-clay to-clay-strong px-5 font-semibold text-white shadow-soft hover:brightness-95"
          >
            {started ? <X className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {started ? "Close steps" : "Start exercise"}
          </button>
        </div>
        {started && (
          <div id="exercise-steps" className="grid gap-4 border-t border-line p-6 sm:p-8 md:col-span-2 md:grid-cols-2">
            <div>
              <h3 className="font-bold">How to do it</h3>
              <ol className="mt-2 grid list-decimal gap-1.5 pl-5 leading-relaxed">
                {s.instructions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
              {s.safetyNotes.length > 0 && <p className="mt-3 text-sm text-muted">{s.safetyNotes.join(" ")}</p>}
            </div>
            <div className="grid content-start gap-3">
              {s.contraindications.length > 0 && (
                <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
                  <strong>Skip this if:</strong> {s.contraindications.join("; ").toLowerCase()}.
                </p>
              )}
              <div className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                <strong>Stop and get help if:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {s.stopSigns.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section>
          <h2 className="font-sans text-lg font-bold">Other exercises</h2>
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {others.map((a) => {
              const p = art(a);
              return (
                <li key={a.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      setSlug(a.slug);
                      setStarted(false);
                    }}
                    className="group w-full overflow-hidden rounded-2xl border border-white/80 bg-card text-left shadow-soft"
                  >
                    <span className={cx("relative block aspect-[4/3]", !p.photo && "bg-blush")}>
                      <Image src={p.src} alt="" fill sizes="16rem" className={p.photo ? "object-cover" : "object-contain p-5"} />
                    </span>
                    <span className="block px-3 py-2.5 text-sm font-bold text-heading group-hover:text-clay-strong">
                      {a.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
