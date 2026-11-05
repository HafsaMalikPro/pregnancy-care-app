import { BadRequestException, type PipeTransform } from '@nestjs/common';
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
