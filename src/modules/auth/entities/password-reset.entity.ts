import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'password_resets' })
export class PasswordReset {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 500 })
  token: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
