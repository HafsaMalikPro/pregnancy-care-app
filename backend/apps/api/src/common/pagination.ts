import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  type PageInfo,
} from '@preconception/contracts';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGE_LIMIT_MAX,
    default: PAGE_LIMIT_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_LIMIT_MAX)
  limit: number = PAGE_LIMIT_DEFAULT;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export class PageInfoDto implements PageInfo {
  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 0 })
  offset: number;

  @ApiProperty({ example: 42, description: 'Total matching items' })
  total: number;
}

export function pageInfo(query: PageQueryDto, total: number): PageInfo {
  return { limit: query.limit, offset: query.offset, total };
}
