import { Injectable, Logger, Scope } from '@nestjs/common';
import { ProfileService } from '../profile/profile.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PaymentService } from '../payment/payment.service';
import { CheckInsService } from '../checkins/checkins.service';
import { ClassSchedulesService } from '../class-schedules/class-schedules.service';
import { BookingsService } from '../bookings/bookings.service';

@Injectable({ scope: Scope.REQUEST })
export class MobileBffService {
  private readonly logger = new Logger(MobileBffService.name);

  constructor(
    private readonly profileService: ProfileService,
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentService: PaymentService,
    private readonly checkInsService: CheckInsService,
    private readonly classSchedulesService: ClassSchedulesService,
    private readonly bookingsService: BookingsService,
  ) {}

  async getDashboardPayload(userId: string) {
    this.logger.log(`Aggregating mobile dashboard data for global user: ${userId}`);

    // Fetch all dashboard data concurrently
    const [profile, subscriptions, checkInStats, upcomingClasses, recentBookings] = await Promise.all([
      this.profileService.getProfile(userId).catch(err => {
        this.logger.error(`Error loading profile: ${err.message}`);
        return null;
      }),
      this.subscriptionService.getTenantSubscription().catch(err => {
        this.logger.error(`Error loading subscription: ${err.message}`);
        return [];
      }),
      this.checkInsService.getCheckInStats().catch(err => {
        this.logger.warn(`Error loading check-in stats: ${err.message}`);
        return { totalCheckIns: 0, checkInsThisMonth: 0, checkInsThisWeek: 0, lastCheckIn: null };
      }),
      this.classSchedulesService.getUpcomingSchedules(5).catch(err => {
        this.logger.warn(`Error loading class schedules: ${err.message}`);
        return [];
      }),
      this.bookingsService.getMyBookings('confirmed', 3).catch(err => {
        this.logger.warn(`Error loading bookings: ${err.message}`);
        return [];
      }),
    ]);

    const activeSub = (subscriptions as { status?: string; plan?: { label?: string }; startsAt?: unknown; endsAt?: unknown; trialEndsAt?: unknown }[])
      .find(s => s.status === 'active') ?? subscriptions[0] ?? null;

    return {
      user: profile
        ? {
            id: profile.globalId,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            phoneNumber: profile.phoneNumber,
            status: profile.status,
          }
        : null,
      subscription: activeSub
        ? {
            plan: activeSub.plan?.label ?? null,
            status: activeSub.status,
            startsAt: activeSub.startsAt,
            endsAt: activeSub.endsAt,
          }
        : null,
      stats: checkInStats,
      upcomingClasses,
      recentBookings,
    };
  }

  async getBillingPayload() {
    this.logger.log('Aggregating billing data (subscription + invoices)');

    const [subscriptions, invoices] = await Promise.all([
      this.subscriptionService.getTenantSubscription().catch(err => {
        this.logger.error(`Error loading subscription: ${err.message}`);
        return [];
      }),
      this.paymentService.getTenantInvoices(20).catch(err => {
        this.logger.error(`Error loading invoices: ${err.message}`);
        return [];
      }),
    ]);

    const activeSub = (subscriptions as { status?: string; plan?: { label?: string }; startsAt?: unknown; endsAt?: unknown; trialEndsAt?: unknown }[])
      .find(s => s.status === 'active') ?? subscriptions[0] ?? null;

    return {
      subscription: activeSub
        ? {
            plan: activeSub.plan?.label ?? 'Plan inconnu',
            status: activeSub.status,
            startsAt: activeSub.startsAt,
            endsAt: activeSub.endsAt,
            trialEndsAt: activeSub.trialEndsAt,
          }
        : null,
      invoices: invoices.map(inv => ({
        id: String(inv.id),
        amount: inv.grandTotal ?? 0,
        currency: inv.currency ?? 'DZD',
        status: 'completed',
        createdAt: inv.createdAt,
      })),
    };
  }
}
