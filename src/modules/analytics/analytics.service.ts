import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CentralMetric } from './entities/central-metric.entity';
import { TenantMembersService } from '../admin/tenant-members.service';
import { TenantClassesService } from '../admin/tenant-classes.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(CentralMetric)
    private readonly metricRepo: Repository<CentralMetric>,
    private readonly dataSource: DataSource,
    private readonly tenantMembersService: TenantMembersService,
    private readonly tenantClassesService: TenantClassesService,
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
    try {
      if (tenantId) {
        return await this.metricRepo.find({ where: { tenantId } });
      }
      return await this.metricRepo.find();
    } catch (err) {
      // Table central_metrics may not yet be provisioned on this environment
      this.logger.warn(`central_metrics table unavailable: ${err.message}`);
      return [];
    }
  }

  /**
   * Résumé des KPIs pour le dashboard admin mobile, filtré par salle.
   */
  async getAdminSummary(tenantId: string): Promise<{
    activeMembers: number;
    inactiveMembers: number;
    checkinsToday: number;
    memberVisitsToday: number;
    manualBookings: number;
    onlineBookings: number;
    onlineSignups: number;
    revenueThisMonth: number;
    currency: string;
    totalOrders: number;
    gymName: string;
  }> {
    const run = async <T>(sql: string, params: unknown[] = []): Promise<T> => {
      const rows = await this.dataSource.query(sql, params);
      return rows?.[0] ?? {};
    };

    const hasTenantDb = await this.tenantMembersService.hasTenantDatabase(tenantId);
    const tenantMemberStats = await this.tenantMembersService.countMembers(tenantId);
    const tenantBookingStats = hasTenantDb
      ? await this.tenantClassesService.countMonthlyBookings(tenantId)
      : null;

    const [centralMembers, checkins, bookings, signups, revenue, gym] = await Promise.all([
      hasTenantDb
        ? Promise.resolve({ active: String(tenantMemberStats.active), inactive: String(tenantMemberStats.inactive) })
        : run<{ active: string; inactive: string }>(
          `SELECT
             SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active,
             SUM(CASE WHEN u.is_active = 0 OR u.is_active IS NULL THEN 1 ELSE 0 END) AS inactive
           FROM tenant_users tu
           INNER JOIN users u ON u.global_id = tu.global_user_id
           WHERE tu.tenant_id = ? AND u.deleted_at IS NULL`,
          [tenantId],
        ),
      run<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM checkins
         WHERE tenant_id = ? AND DATE(checked_in_at) = CURDATE()`,
        [tenantId],
      ),
      run<{ manual_cnt: string; online_cnt: string }>(
        `SELECT
           SUM(CASE WHEN cb.status IN ('confirmed','attended','pending') THEN 1 ELSE 0 END) AS online_cnt,
           0 AS manual_cnt
         FROM class_bookings cb
         WHERE cb.tenant_id = ?
           AND MONTH(cb.created_at) = MONTH(NOW())
           AND YEAR(cb.created_at) = YEAR(NOW())`,
        [tenantId],
      ),
      run<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM tenant_users tu
         INNER JOIN users u ON u.global_id = tu.global_user_id
         WHERE tu.tenant_id = ?
           AND MONTH(u.created_at) = MONTH(NOW())
           AND YEAR(u.created_at) = YEAR(NOW())
           AND u.deleted_at IS NULL`,
        [tenantId],
      ),
      run<{ total: string; orders: string; currency: string }>(
        `SELECT COALESCE(SUM(o.grand_total), 0) AS total, COUNT(*) AS orders,
                COALESCE(MAX(o.currency), 'USD') AS currency
         FROM orders o
         INNER JOIN tenant_users tu ON tu.global_user_id = o.customer_id
         WHERE tu.tenant_id = ?
           AND MONTH(o.created_at) = MONTH(NOW())
           AND YEAR(o.created_at) = YEAR(NOW())
           AND o.deleted_at IS NULL`,
        [tenantId],
      ),
      run<{ name: string }>(
        `SELECT name FROM tenants WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [tenantId],
      ),
    ]);

    const checkinsToday = parseInt(checkins.cnt ?? '0', 10);

    return {
      activeMembers: parseInt(centralMembers.active ?? '0', 10),
      inactiveMembers: parseInt(centralMembers.inactive ?? '0', 10),
      checkinsToday,
      memberVisitsToday: checkinsToday,
      manualBookings: tenantBookingStats?.manual ?? parseInt(bookings.manual_cnt ?? '0', 10),
      onlineBookings: tenantBookingStats?.online ?? parseInt(bookings.online_cnt ?? '0', 10),
      onlineSignups: parseInt(signups.cnt ?? '0', 10),
      revenueThisMonth: parseFloat(revenue.total ?? '0'),
      currency: revenue.currency ?? 'USD',
      totalOrders: parseInt(revenue.orders ?? '0', 10),
      gymName: gym.name ?? '',
    };
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
