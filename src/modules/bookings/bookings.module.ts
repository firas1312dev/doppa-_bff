import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassBooking } from './entities/class-booking.entity';
import { ClassSchedule } from '../class-schedules/entities/class-schedule.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [TypeOrmModule.forFeature([ClassBooking, ClassSchedule]), AdminModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
