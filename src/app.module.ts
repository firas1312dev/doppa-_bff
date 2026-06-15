import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './database/database.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MobileBffModule } from './modules/mobile-bff/mobile-bff.module';
import { HealthController } from './modules/health.controller';

import { AuditLoggerMiddleware } from './common/middleware/audit-logger.middleware';
import { TenantResolverMiddleware } from './common/middleware/tenant.resolver.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    // Standard Global Rate Limiting: 100 requests per minute per IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    DatabaseModule,
    TenantModule,
    AuthModule,
    ProfileModule,
    SubscriptionModule,
    PaymentModule,
    AnalyticsModule,
    MobileBffModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuditLoggerMiddleware, TenantResolverMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}

