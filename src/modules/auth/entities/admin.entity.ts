import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/**
 * Central `admins` table (Doppa / coderstm). These are platform / gym
 * administrators — a distinct identity from members (`users`). Passwords are
 * Laravel bcrypt hashes (`$2y$`), so verification must go through
 * `verifyPassword` (which normalises the version tag).
 */
@Entity({ name: 'admins' })
export class Admin {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'first_name' })
  firstName: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'last_name' })
  lastName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'phone_number' })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  status: string;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  isActive: boolean;

  // NB: column name has a typo in the schema (`is_supper_admin`) — keep it.
  @Column({ type: 'tinyint', default: 0, name: 'is_supper_admin' })
  isSuperAdmin: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
