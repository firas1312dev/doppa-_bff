import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'checkins' })
@Index(['tenantId', 'userId'])
export class CheckIn {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string; // FK → users.global_id

  @Column({ type: 'varchar', length: 100, name: 'tenant_id' })
  tenantId: string; // FK → tenants.id

  @Column({
    type: 'enum',
    enum: ['manual', 'qr', 'auto', 'admin'],
    default: 'manual',
  })
  type: 'manual' | 'qr' | 'auto' | 'admin';

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', name: 'checked_in_at', default: () => 'CURRENT_TIMESTAMP' })
  checkedInAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
