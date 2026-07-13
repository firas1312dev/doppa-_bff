import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';

@Controller({ path: 'analytics', version: '1' })
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('central')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async getMetrics(@Query('tenantId') tenantId?: string) {
    return this.analyticsService.getCentralMetrics(tenantId);
  }

  /** KPIs temps réel pour le dashboard admin mobile (filtrés par salle) */
  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async getAdminSummary(@Tenant() tenantId: string) {
    return this.analyticsService.getAdminSummary(tenantId);
  }
}
