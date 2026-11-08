import {
  BadRequestException,
  NotFoundException,
  type PipeTransform,
} from '@nestjs/common';
import { isIsoDate } from '@preconception/utils';

/** Route parameter that must be a real YYYY-MM-DD calendar date. */
export class ParseCalendarDatePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isIsoDate(value)) {
      throw new BadRequestException([
        'date must be a calendar date in YYYY-MM-DD form',
      ]);
    }
    return value;
  }
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 120;

/**
 * Route parameter that must be a content slug (lowercase words and hyphens, at most 120
 * characters, as enforced when content is created). Anything else cannot name published
 * content, so it is a 404 rather than a 400, and never reaches the database.
 */
export class ParseSlugPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (
      typeof value !== 'string' ||
      value.length > SLUG_MAX_LENGTH ||
      !SLUG_PATTERN.test(value)
    ) {
      throw new NotFoundException('Not found.');
    }
    return value;
  }
}
