import { ThrottleWrite } from '../common/throttle.js';
import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Staff } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/owner.js';
import { ApiErrors, ApiUserAuth } from '../common/swagger.js';
import { AdminContentService } from './admin-content.service.js';
import { AdminArticleDto, CreateWeekGuideDto } from './admin.dto.js';

/**
 * Week guides are created here; editing, review, publishing and archiving use the
 * `/admin/articles/{id}` routes, so they go through the same clinical-review workflow.
 */
@ApiTags('admin')
@ApiUserAuth()
@ApiErrors(403)
@Controller('admin/week-guides')
export class AdminWeekGuidesController {
  constructor(private readonly content: AdminContentService) {}

  @ThrottleWrite('staffWrite')
  @Post()
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create a week-guide draft',
    description:
      'Roles: content_editor, administrator. Creates version N+1 of `pregnancy-week-<week>`; 409 if a working version exists. Then submit, review and publish via /admin/articles/{id}.',
  })
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiErrors(400, 409)
  create(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateWeekGuideDto,
    @Req() req: Request,
  ) {
    return this.content.createWeekGuideDraft(
      actor,
      {
        week: dto.week,
        locale: dto.locale,
        title: dto.title,
        summary: dto.summary,
        sections: dto.sections,
        references: dto.references,
      },
      req.requestId,
    );
  }
}
