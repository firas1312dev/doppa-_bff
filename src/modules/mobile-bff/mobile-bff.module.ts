import { Module } from '@nestjs/common';
import { MobileBffService } from './mobile-bff.service';
import { MobileBffController } from './mobile-bff.controller';
import { ProfileModule } from '../profile/profile.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PaymentModule } from '../payment/payment.module';
import { CheckInsModule } from '../checkins/checkins.module';
import { ClassSchedulesModule } from '../class-schedules/class-schedules.module';
import { BookingsModule } from '../bookings/bookings.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    ProfileModule,
    SubscriptionModule,
    PaymentModule,
    CheckInsModule,
    ClassSchedulesModule,
    BookingsModule,
    AdminModule,
  ],
  controllers: [MobileBffController],
  providers: [MobileBffService],
})
export class MobileBffModule {}


