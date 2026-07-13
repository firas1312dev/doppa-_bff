import { Module } from '@nestjs/common';
import { TenantFeaturesController } from './tenant-features.controller';

@Module({
  controllers: [TenantFeaturesController],
})
export class TenantFeaturesModule {}
