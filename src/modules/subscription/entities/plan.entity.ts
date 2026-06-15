import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity({ name: 'plans' })
export class Plan {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string; // Nom du plan (ex: "Premium Monthly")

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string; // Identifiant unique (ex: "premium-monthly")

  @Column({ type: 'longtext', nullable: true })
  description: string;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'varchar', length: 255, default: 'month' })
  interval: string; // 'month' | 'year' | 'week'

  @Column({ type: 'int', unsigned: true, default: 1, name: 'interval_count' })
  intervalCount: number;

  @Column({ type: 'double', default: 0 })
  price: number;

  @Column({ type: 'int', unsigned: true, nullable: true, name: 'trial_days' })
  trialDays: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
