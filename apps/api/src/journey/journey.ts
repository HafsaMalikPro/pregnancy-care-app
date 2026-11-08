import type {
  Appointment,
  PersonalVisit,
  VisitSchedule,
} from '@preconception/contracts';
import { dateAtGestation } from '../pregnancy/dating.js';

/** Weeks 1-6 after birth get a postpartum guide; day 0 is the birth date. */
export const POSTPARTUM_GUIDE_WEEKS = 6;

export function postpartumWeek(daysSinceBirth: number): number | null {
  if (daysSinceBirth < 0) return null;
  const week = Math.floor(daysSinceBirth / 7) + 1;
  return week <= POSTPARTUM_GUIDE_WEEKS ? week : null;
}

export const POSTPARTUM_DISCLAIMER =
  'This is general information, not medical advice. If something feels wrong after the birth, contact your midwife, health visitor or doctor. If you think you or your baby are in danger, call your local emergency number.';

/**
 * One schedule per trimester: a schedule written for the profile's country wins over a general
 * one (countryCode null); schedules for other countries are never used.
 */
export function chooseSchedules(
  schedules: readonly VisitSchedule[],
  countryCode: string | null,
): VisitSchedule[] {
  const chosen: VisitSchedule[] = [];
  for (const trimester of [1, 2, 3] as const) {
    const fits = schedules.filter((s) => s.sections.trimester === trimester);
    const local = countryCode
      ? fits.find((s) => s.sections.countryCode === countryCode)
      : undefined;
    const general = fits.find((s) => s.sections.countryCode === null);
    const pick = local ?? general;
    if (pick) chosen.push(pick);
  }
  return chosen;
}

/**
 * Maps template visits onto the pregnancy's calendar (week w = gestation w*7 … w*7+6, as in the
 * timeline) and links an appointment of the same kind booked inside the window.
 */
export function personalVisits(
  schedules: readonly VisitSchedule[],
  dueDate: string,
  today: string,
  appointments: readonly Pick<Appointment, 'id' | 'kind' | 'startsAt'>[],
): PersonalVisit[] {
  return schedules
    .flatMap((s) =>
      s.sections.visits.map((v) => {
        const startDate = dateAtGestation(dueDate, v.fromWeek * 7);
        const endDate = dateAtGestation(dueDate, v.toWeek * 7 + 6);
        const booked = appointments.find((a) => {
          const day = a.startsAt.slice(0, 10);
          return (
            a.kind === v.appointmentKind && day >= startDate && day <= endDate
          );
        });
        const status: PersonalVisit['status'] =
          endDate < today ? 'past' : startDate > today ? 'upcoming' : 'current';
        return {
          scheduleSlug: s.slug,
          key: v.key,
          title: v.title,
          trimester: s.sections.trimester,
          fromWeek: v.fromWeek,
          toWeek: v.toWeek,
          startDate,
          endDate,
          status,
          purpose: v.purpose,
          typicalChecks: v.typicalChecks,
          appointmentKind: v.appointmentKind,
          bookedAppointmentId: booked?.id ?? null,
          review: s.review,
        };
      }),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
