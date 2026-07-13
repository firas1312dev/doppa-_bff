import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type NotificationType = 'info' | 'success' | 'warning' | 'alert' | 'booking' | 'payment' | 'system';

@Entity({ name: 'mobile_notifications' })
@Index(['tenantId', 'userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 100, name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: ['info', 'success', 'warning', 'alert', 'booking', 'payment', 'system'],
    default: 'info',
  })
  type: NotificationType;

  @Column({ type: 'json', nullable: true })
  data: Record<string, any> | null;

  @Column({ type: 'timestamp', name: 'read_at', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
