import { Module } from '@nestjs/common';
import { ReminderDeliveryService } from './reminder-delivery.service.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import {
  AdminReminderDeliveriesController,
  RemindersController,
} from './reminders.controller.js';

@Module({
  controllers: [RemindersController, AdminReminderDeliveriesController],
  providers: [ReminderScheduleService, ReminderDeliveryService],
  exports: [ReminderScheduleService, ReminderDeliveryService],
})
export class RemindersModule {}
