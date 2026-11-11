import { Module } from '@nestjs/common';
import { OwnerClock } from '../common/owner-clock.js';
import { PregnancyContext } from '../common/pregnancy-context.js';
import { ConsentModule } from '../consent/consent.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ArticlesController } from './articles.controller.js';
import {
  ActivitiesController,
  MealPlansController,
  RecipesController,
} from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { ReadinessController } from './readiness.controller.js';

@Module({
  imports: [ConsentModule, EntitlementsModule],
  controllers: [
    ArticlesController,
    ReadinessController,
    RecipesController,
    ActivitiesController,
    MealPlansController,
  ],
  providers: [OwnerClock, PregnancyContext, CatalogService],
  exports: [CatalogService],
})
export class ContentModule {}
