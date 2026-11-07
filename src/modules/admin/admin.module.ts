import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AdminClassesService } from './admin-classes.service';
import { AdminController } from './admin.controller';
import { MembersExportController } from './members-export.controller';
import { TenantMembersService } from './tenant-members.service';
import { TenantClassesService } from './tenant-classes.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'super-secret-jwt-key-2026'),
      }),
    }),
  ],
  controllers: [AdminController, MembersExportController],
  providers: [AdminService, AdminClassesService, TenantMembersService, TenantClassesService],
  exports: [AdminService, AdminClassesService, TenantMembersService, TenantClassesService],
})
export class AdminModule {}
