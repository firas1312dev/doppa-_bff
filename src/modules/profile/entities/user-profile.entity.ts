import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity({ name: 'users' })
export class UserProfile {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true, name: 'global_id' })
  globalId: string; // Identifiant global de l'utilisateur (dans les jointures tenant_users)

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'first_name' })
  firstName: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'last_name' })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  password: string; // Hashed by Laravel bcrypt — compatible with bcrypt.compare()

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'phone_number' })
  phoneNumber: string;

  @Column({ type: 'date', nullable: true })
  dob: Date;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'varchar', length: 255, default: 'Active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
