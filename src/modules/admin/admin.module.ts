import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminClassesService } from './admin-classes.service';
import { AdminController } from './admin.controller';
import { TenantMembersService } from './tenant-members.service';
import { TenantClassesService } from './tenant-classes.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminClassesService, TenantMembersService, TenantClassesService],
  exports: [AdminService, AdminClassesService, TenantMembersService, TenantClassesService],
})
export class AdminModule {}
