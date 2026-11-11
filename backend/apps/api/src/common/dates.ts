import { isIsoDate } from '@preconception/utils';
import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Calendar dates (Postgres DATE) travel as "YYYY-MM-DD" and are held as UTC-midnight Dates
 * in Prisma. These two functions are the only conversion points.
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  return toIsoDate(new Date(fromIsoDate(value).getTime() + days * 86_400_000));
}

/** Validates a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function IsCalendarDate(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a calendar date in YYYY-MM-DD form`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isIsoDate(value),
      },
    });
  };
}
