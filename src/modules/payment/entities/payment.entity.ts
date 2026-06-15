import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

// La table orders du VPS sert de table de paiements/commandes
@Entity({ name: 'orders' })
export class Payment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'customer_id' })
  customerId: string; // Correspond à users.global_id

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'orderable_type' })
  orderableType: string; // Polymorphique (type de la ressource liée)

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'orderable_id' })
  orderableId: string;

  @Column({ type: 'double', default: 0, name: 'grand_total' })
  grandTotal: number;

  @Column({ type: 'double', default: 0, name: 'sub_total' })
  subTotal: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  currency: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
