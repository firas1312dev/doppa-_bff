import { Injectable, Inject, Scope, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification, NotificationType } from './entities/notification.entity';

export interface NotificationDto {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  data: Record<string, any> | null;
  readAt: string | null;
  createdAt: string;
}

@Injectable({ scope: Scope.REQUEST })
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @Inject(REQUEST)
    private readonly request: any,
  ) {}

  private get userId(): string {
    return this.request.user?.sub;
  }

  private get tenantId(): string {
    return this.request.tenantId;
  }

  async getMyNotifications(unreadOnly = false, limit = 50): Promise<NotificationDto[]> {
    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId AND n.tenantId = :tenantId', {
        userId: this.userId,
        tenantId: this.tenantId,
      })
      .orderBy('n.createdAt', 'DESC')
      .take(limit);

    if (unreadOnly) {
      qb.andWhere('n.readAt IS NULL');
    }

    const notifs = await qb.getMany();
    return notifs.map(this.toDto);
  }

  async getUnreadCount(): Promise<{ count: number }> {
    const count = await this.notifRepo.count({
      where: {
        userId: this.userId,
        tenantId: this.tenantId,
        readAt: IsNull(),
      },
    });
    return { count };
  }

  async markAsRead(notificationId: number): Promise<NotificationDto> {
    const notif = await this.notifRepo.findOne({
      where: { id: notificationId, userId: this.userId, tenantId: this.tenantId },
    });
    if (!notif) {
      throw new NotFoundException(`Notification ${notificationId} not found.`);
    }
    if (!notif.readAt) {
      notif.readAt = new Date();
      await this.notifRepo.save(notif);
    }
    return this.toDto(notif);
  }

  async markAllAsRead(): Promise<{ updated: number }> {
    const result = await this.notifRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('userId = :userId AND tenantId = :tenantId AND readAt IS NULL', {
        userId: this.userId,
        tenantId: this.tenantId,
      })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  /**
   * Internal method to push a notification to a user.
   * Called by event listeners and other services.
   */
  async push(
    userId: string,
    tenantId: string,
    title: string,
    message: string,
    type: NotificationType = 'info',
    data?: Record<string, any>,
  ): Promise<void> {
    const notif = this.notifRepo.create({ userId, tenantId, title, message, type, data: data ?? null });
    await this.notifRepo.save(notif);
  }

  @OnEvent('booking.confirmed')
  async handleBookingConfirmed(event: { userId: string; tenantId: string; className: string }) {
    await this.push(
      event.userId,
      event.tenantId,
      'Réservation confirmée',
      `Votre réservation pour "${event.className}" a été confirmée.`,
      'booking',
      { type: 'booking_confirmed' },
    );
  }

  @OnEvent('booking.cancelled')
  async handleBookingCancelled(event: { userId: string; tenantId: string; className: string }) {
    await this.push(
      event.userId,
      event.tenantId,
      'Réservation annulée',
      `Votre réservation pour "${event.className}" a été annulée.`,
      'booking',
      { type: 'booking_cancelled' },
    );
  }

  @OnEvent('payment.created')
  async handlePaymentCreated(event: { userId?: string; tenantId: string; amount: number }) {
    if (!event.userId) return;
    await this.push(
      event.userId,
      event.tenantId,
      'Paiement reçu',
      `Votre paiement de ${event.amount} DZD a été enregistré.`,
      'payment',
      { type: 'payment_received', amount: event.amount },
    );
  }

  private toDto = (n: Notification): NotificationDto => ({
    id: String(n.id),
    title: n.title,
    message: n.message,
    type: n.type,
    data: n.data,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  });
}
