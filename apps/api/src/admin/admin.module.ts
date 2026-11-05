import { Module } from '@nestjs/common';
import { AdminArticlesController } from './admin-articles.controller.js';
import { AdminContentService } from './admin-content.service.js';
import { AdminStructuredController } from './admin-structured.controller.js';
import { AdminTasksController } from './admin-tasks.controller.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminWeekGuidesController } from './admin-week-guides.controller.js';

@Module({
  controllers: [
    AdminArticlesController,
    AdminStructuredController,
    AdminTasksController,
    AdminUsersController,
    AdminWeekGuidesController,
  ],
  providers: [AdminContentService],
})
export class AdminModule {}
