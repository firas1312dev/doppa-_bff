import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity({ name: 'central_metrics' })
@Index(['tenantId', 'metricType'], { unique: true })
export class CentralMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  tenantId: string;

  @Column({ type: 'varchar', length: 50 })
  metricType: string; // e.g., 'MEMBER_COUNT', 'SUBSCRIPTION_COUNT', 'TOTAL_REVENUE', 'ATTENDANCE_COUNT'

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  value: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
