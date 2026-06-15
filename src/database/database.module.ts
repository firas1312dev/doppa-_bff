import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { TenantUser } from '../modules/tenant/entities/tenant-user.entity';
import { UserProfile } from '../modules/profile/entities/user-profile.entity';
import { Subscription } from '../modules/subscription/entities/subscription.entity';
import { Plan } from '../modules/subscription/entities/plan.entity';
import { Payment } from '../modules/payment/entities/payment.entity';

const ALL_ENTITIES = [Tenant, TenantUser, UserProfile, Subscription, Plan, Payment];

@Global()
@Module({
  imports: [
    // Connexion unique vers la base centralisée coderstm_gympify
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', '127.0.0.1'),
        port: configService.get<number>('DB_PORT', 3307),
        username: configService.get<string>('DB_USERNAME', 'coderstm_gympify'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_DATABASE', 'coderstm_gympify'),
        entities: ALL_ENTITIES,
        synchronize: false, // Ne jamais synchroniser automatiquement sur une DB existante en production
        logging: configService.get<string>('NODE_ENV') !== 'production',
        timezone: 'Z',
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
