import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type BookingStatus = 'confirmed' | 'cancelled' | 'pending' | 'attended' | 'no_show';

@Entity({ name: 'class_bookings' })
@Index(['tenantId', 'userId'])
@Index(['classScheduleId', 'status'])
export class ClassBooking {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string; // FK → users.global_id

  @Column({ type: 'varchar', length: 100, name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'bigint', unsigned: true, name: 'class_schedule_id' })
  classScheduleId: number;

  @Column({
    type: 'enum',
    enum: ['confirmed', 'cancelled', 'pending', 'attended', 'no_show'],
    default: 'confirmed',
  })
  status: BookingStatus;

  @Column({ type: 'timestamp', name: 'booked_at', default: () => 'CURRENT_TIMESTAMP' })
  bookedAt: Date;

  @Column({ type: 'timestamp', name: 'cancelled_at', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'cancel_reason' })
  cancelReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
