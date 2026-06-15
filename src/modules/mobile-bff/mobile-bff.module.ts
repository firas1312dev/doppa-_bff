import { Module } from '@nestjs/common';
import { MobileBffService } from './mobile-bff.service';
import { MobileBffController } from './mobile-bff.controller';
import { ProfileModule } from '../profile/profile.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    ProfileModule,
    SubscriptionModule,
    PaymentModule,
  ],
  controllers: [MobileBffController],
  providers: [MobileBffService],
})
export class MobileBffModule {}

