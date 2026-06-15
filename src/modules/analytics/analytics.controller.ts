import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller({ path: 'analytics', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('central')
  @Roles('ADMIN') // Only ADMIN role (SaaS host admins or tenant manager admins depending on context) can read metrics
  async getMetrics(@Query('tenantId') tenantId?: string) {
    return this.analyticsService.getCentralMetrics(tenantId);
  }
}
