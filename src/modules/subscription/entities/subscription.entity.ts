import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Plan } from './plan.entity';

@Entity({ name: 'subscriptions' })
export class Subscription {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'tenant_id' })
  tenantId: string; // FK → tenants.id (slug du tenant)

  @Column({ type: 'varchar', length: 255, nullable: true })
  type: string; // type de subscription

  @Column({ type: 'varchar', length: 255, nullable: true })
  status: string; // 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'

  @Column({ type: 'timestamp', nullable: true, name: 'starts_at' })
  startsAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'ends_at' })
  endsAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'trial_ends_at' })
  trialEndsAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'canceled_at' })
  canceledAt: Date;

  @Column({ type: 'bigint', unsigned: true, nullable: true, name: 'plan_id' })
  planId: number;

  @ManyToOne(() => Plan, { eager: true, nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
