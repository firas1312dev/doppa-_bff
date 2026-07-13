import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'class_schedules' })
@Index(['tenantId', 'isActive'])
export class ClassSchedule {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 100, name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instructor: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'timestamp', name: 'start_time' })
  startTime: Date;

  @Column({ type: 'timestamp', name: 'end_time' })
  endTime: Date;

  @Column({ type: 'int', unsigned: true, name: 'max_capacity', default: 20 })
  maxCapacity: number;

  @Column({ type: 'int', unsigned: true, name: 'current_bookings', default: 0 })
  currentBookings: number;

  @Column({ type: 'tinyint', name: 'is_active', default: 1 })
  isActive: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string | null; // UI display color hex

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
