import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CentralMetric } from './entities/central-metric.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(CentralMetric)
    private readonly metricRepo: Repository<CentralMetric>,
  ) {}

  @OnEvent('member.created')
  async handleMemberCreated(event: { tenantId: string; userId: string; type: string }) {
    this.logger.log(`[Analytics Event] Member created for tenant: ${event.tenantId}`);
    await this.incrementMetric(event.tenantId, 'MEMBER_COUNT', 1);
  }

  @OnEvent('subscription.created')
  async handleSubscriptionCreated(event: { tenantId: string; userId: string; price: number }) {
    this.logger.log(`[Analytics Event] Subscription created for tenant: ${event.tenantId}`);
    await this.incrementMetric(event.tenantId, 'SUBSCRIPTION_COUNT', 1);
  }

  @OnEvent('payment.created')
  async handlePaymentCreated(event: { tenantId: string; userId: string; amount: number }) {
    this.logger.log(`[Analytics Event] Payment recorded for tenant: ${event.tenantId}, amount: ${event.amount}`);
    await this.incrementMetric(event.tenantId, 'TOTAL_REVENUE', event.amount);
  }

  @OnEvent('attendance.recorded')
  async handleAttendanceRecorded(event: { tenantId: string; userId: string }) {
    this.logger.log(`[Analytics Event] Attendance check-in for tenant: ${event.tenantId}`);
    await this.incrementMetric(event.tenantId, 'ATTENDANCE_COUNT', 1);
  }

  // Get metrics across tenants for global analytics (accessible by platform super-admins)
  async getCentralMetrics(tenantId?: string): Promise<CentralMetric[]> {
    if (tenantId) {
      return this.metricRepo.find({ where: { tenantId } });
    }
    return this.metricRepo.find();
  }

  private async incrementMetric(tenantId: string, metricType: string, incrementBy: number) {
    try {
      let metric = await this.metricRepo.findOne({ where: { tenantId, metricType } });
      
      if (!metric) {
        metric = this.metricRepo.create({
          tenantId,
          metricType,
          value: 0,
        });
      }
      
      metric.value = Number(metric.value) + Number(incrementBy);
      await this.metricRepo.save(metric);
    } catch (err) {
      this.logger.error(`Failed to update central metric ${metricType} for tenant ${tenantId}`, err.stack);
    }
  }
}
