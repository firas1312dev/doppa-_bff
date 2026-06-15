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

  async getHistory(userId: string): Promise<Payment[]> {
    // userId ici correspond au `sub` du JWT, c'est à dire le globalId = customer_id
    return this.orderRepo.find({ 
      where: { customerId: userId }, 
      order: { createdAt: 'DESC' } 
    });
  }

  // Création désactivée dans le BFF Mobile. Laissons le backend Laravel gérer Stripe/Paiements
  async create(userId: string, amount: number, paymentMethod: string): Promise<Payment> {
    throw new Error('Payment creation should happen on the central web app, not mobile BFF.');
  }
}

