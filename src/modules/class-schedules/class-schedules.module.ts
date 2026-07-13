import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassSchedule } from './entities/class-schedule.entity';
import { ClassBooking } from '../bookings/entities/class-booking.entity';
import { ClassSchedulesService } from './class-schedules.service';
import { ClassSchedulesController } from './class-schedules.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [TypeOrmModule.forFeature([ClassSchedule, ClassBooking]), AdminModule],
  controllers: [ClassSchedulesController],
  providers: [ClassSchedulesService],
  exports: [ClassSchedulesService],
})
export class ClassSchedulesModule {}
