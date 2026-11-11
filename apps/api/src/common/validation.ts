import {
  type ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface ValidationDetail {
  path: string;
  message: string;
}

/** Flattens class-validator's error tree into dotted paths, e.g. `references.0.url`. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationDetail[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((message) => ({
      path,
      message,
    }));
    return [...own, ...flattenValidationErrors(e.children ?? [], path)];
  });
}

/**
 * The deepest JSON nesting any request may use. Real bodies here are at most 4–5 levels deep;
 * the limit leaves room while stopping recursion attacks (F-02: 5,000 levels overflowed
 * class-transformer's recursion and answered 500).
 */
export const MAX_JSON_DEPTH = 32;

/** Nesting depth of a parsed value, measured without recursion (so it cannot overflow). */
export function jsonDepth(value: unknown, limit = Infinity): number {
  let max = 0;
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    if (node === null || typeof node !== 'object') continue;
    const level = depth + 1;
    if (level > max) max = level;
    if (max > limit) return max;
    for (const child of Object.values(node as Record<string, unknown>)) {
      if (child !== null && typeof child === 'object')
        stack.push([child, level]);
    }
  }
  return max;
}

export function assertJsonDepth(value: unknown): void {
  if (jsonDepth(value, MAX_JSON_DEPTH) > MAX_JSON_DEPTH) {
    throw new BadRequestException({
      message: [
        `Request data is nested too deeply (limit ${MAX_JSON_DEPTH} levels).`,
      ],
      details: [
        {
          path: '',
          message: `Request data is nested too deeply (limit ${MAX_JSON_DEPTH} levels).`,
        },
      ],
    });
  }
}

/** ValidationPipe that refuses over-deep input before class-transformer walks it. */
class DepthLimitedValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata) {
    assertJsonDepth(value);
    return super.transform(value, metadata);
  }
}

/**
 * Global pipe: unknown fields are rejected, failures carry structured `details`
 * (path + message) that the exception filter returns as-is, and over-deep input is refused
 * with 400 before any recursive processing.
 */
export function createValidationPipe(): ValidationPipe {
  return new DepthLimitedValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const details = flattenValidationErrors(errors);
      return new BadRequestException({
        message: details.map((d) => d.message),
        details,
      });
    },
  });
}
