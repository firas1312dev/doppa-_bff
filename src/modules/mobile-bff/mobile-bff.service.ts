import { Injectable, Logger, Scope } from '@nestjs/common';
import { ProfileService } from '../profile/profile.service';
import { PaymentService } from '../payment/payment.service';

@Injectable({ scope: Scope.REQUEST })
export class MobileBffService {
  private readonly logger = new Logger(MobileBffService.name);

  constructor(
    private readonly profileService: ProfileService,
    private readonly paymentService: PaymentService,
  ) {}

  async getDashboardPayload(userId: string) {
    this.logger.log(`Aggregating mobile dashboard data for global user: ${userId}`);

    // Fetch all records concurrently to minimize backend round-trips
    const [
      profile,
      payments,
    ] = await Promise.all([
      this.profileService.getProfile(userId).catch(err => {
        this.logger.error(`Error loading profile: ${err.message}`);
        return null;
      }),
      this.paymentService.getHistory(userId).catch(err => {
        this.logger.error(`Error loading payments: ${err.message}`);
        return [];
      }),
    ]);

    // Format into an optimized, lightweight payload tailored for mobile consumption
    return {
      user: profile ? {
        id: profile.globalId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phoneNumber: profile.phoneNumber,
        status: profile.status,
      } : null,
      recentOrders: payments.slice(0, 3).map(p => ({
        id: p.id,
        amount: p.grandTotal,
        currency: p.currency,
        createdAt: p.createdAt,
      })),
    };
  }
}
