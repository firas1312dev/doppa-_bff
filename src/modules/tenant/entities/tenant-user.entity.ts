import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tenant_users' })
export class TenantUser {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'tenant_id' })
  tenantId: string; // FK → tenants.id

  @Column({ type: 'varchar', length: 255, name: 'global_user_id' })
  globalUserId: string; // FK → users.global_id
}

