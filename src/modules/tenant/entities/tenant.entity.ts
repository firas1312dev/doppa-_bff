import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string; // Identifiant unique du tenant (ex: "alpha-gym")

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  identifier: string;

  @Column({ type: 'varchar', length: 255, default: 'Active' })
  status: string; // 'Active' | 'Inactive'

  @Column({ type: 'varchar', length: 255, nullable: true })
  category: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}

