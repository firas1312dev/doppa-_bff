
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async registerTenant(dto: { id: string; email: string; name: string }): Promise<Tenant> {
    const tenantId = dto.id.toLowerCase().trim();

    // Check if ID or email already exists
    const existing = await this.tenantRepo.findOne({
      where: [{ id: tenantId }, { email: dto.email }],
    });

    if (existing) {
      throw new BadRequestException(`Tenant ID or email is already in use.`);
    }

    const tenant = this.tenantRepo.create({
      id: tenantId,
      email: dto.email,
      name: dto.name,
      status: 'Active',
    });

    return this.tenantRepo.save(tenant);
  }

  async getTenants(): Promise<Tenant[]> {
    return this.tenantRepo.find({
      where: { status: 'Active' },
      select: {
        id: true,
        name: true,
        category: true,
        email: true,
      },
    });
  }
}

