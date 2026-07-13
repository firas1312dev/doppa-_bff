import { Injectable, Inject, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST })
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly orderRepo: Repository<Payment>,
    @Inject(REQUEST)
    private readonly request: any,
  ) {}

  /** Historique des factures du tenant (gym) dans Doppa. */
  async getTenantInvoices(limit = 20): Promise<Payment[]> {
    const tenantId = this.request.tenantId as string | undefined;
    if (!tenantId) return [];
    return this.orderRepo.find({
      where: { customerId: tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** @deprecated La table orders lie customer_id au tenant, pas à l'utilisateur.
   *  Utiliser getTenantInvoices() pour récupérer les factures. */
  async getHistory(_userId: string): Promise<Payment[]> {
    return this.getTenantInvoices();
  }

  // Création désactivée dans le BFF Mobile. Laissons le backend Laravel gérer Stripe/Paiements
  async create(userId: string, amount: number, paymentMethod: string): Promise<Payment> {
    throw new Error('Payment creation should happen on the central web app, not mobile BFF.');
  }
}

