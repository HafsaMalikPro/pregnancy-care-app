import { Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module.js';
import { ProfileController } from './profile.controller.js';

@Module({ imports: [RemindersModule], controllers: [ProfileController] })
export class ProfileModule {}
