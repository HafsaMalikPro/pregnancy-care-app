import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  Matches,
} from 'class-validator';

export const TAG_PATTERN = /^[a-z0-9][a-z0-9 _-]{0,39}$/;

/**
 * An optional list of short lower-case tags (trimmed and lower-cased before validation),
 * unique, at most `max` items, each 1-40 characters.
 */
export function TagList(max: number) {
  return applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      Array.isArray(value)
        ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
        : value,
    ),
    IsArray(),
    ArrayUnique(),
    ArrayMaxSize(max),
    Matches(TAG_PATTERN, {
      each: true,
      message:
        'each item must be 1-40 lower-case letters, digits, spaces, _ or -',
    }),
  );
}
