import { BadRequestException, ValidationPipe } from '@nestjs/common';
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
 * Global pipe: unknown fields are rejected, and failures carry structured `details`
 * (path + message) that the exception filter returns as-is.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
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
