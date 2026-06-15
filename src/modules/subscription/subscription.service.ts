import { Injectable, Inject, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST })
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @Inject(REQUEST)
    private readonly request: any,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Renommé pour refléter que les subscriptions sont par tenant et non par utilisateur (modèle B2B SaaS)
  async getTenantSubscription(): Promise<Subscription[]> {
    const tenantId = this.request.tenantId;
    return this.subscriptionRepo.find({ 
      where: { tenantId },
      relations: { plan: true }
    });
  }

  // Création désactivée dans le BFF Mobile car les abonnements SaaS sont gérés côté web/admin
  async create(userId: string, planName: string, price: number): Promise<Subscription> {
    throw new Error('Subscription creation should happen on the central web app, not mobile BFF.');
  }
}


