import { Injectable, Inject, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CheckIn } from './entities/checkin.entity';

export interface CheckInDto {
  id: string;
  tenantId: string;
  type: string;
  notes: string | null;
  checkedInAt: string;
  createdAt: string;
}

@Injectable({ scope: Scope.REQUEST })
export class CheckInsService {
  constructor(
    @InjectRepository(CheckIn)
    private readonly checkInRepo: Repository<CheckIn>,
    @Inject(REQUEST)
    private readonly request: any,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private get userId(): string {
    return this.request.user?.sub;
  }

  private get tenantId(): string {
    return this.request.tenantId;
  }

  async getMyCheckIns(limit = 20): Promise<CheckInDto[]> {
    const records = await this.checkInRepo.find({
      where: { userId: this.userId, tenantId: this.tenantId },
      order: { checkedInAt: 'DESC' },
      take: limit,
    });

    return records.map(this.toDto);
  }

  async createCheckIn(
    type: 'manual' | 'qr' | 'auto' = 'manual',
    notes?: string,
  ): Promise<CheckInDto> {
    const checkIn = this.checkInRepo.create({
      userId: this.userId,
      tenantId: this.tenantId,
      type,
      notes: notes ?? null,
      checkedInAt: new Date(),
    });

    const saved = await this.checkInRepo.save(checkIn);

    this.eventEmitter.emit('attendance.recorded', {
      tenantId: this.tenantId,
      userId: this.userId,
    });

    return this.toDto(saved);
  }

  async getCheckInStats(): Promise<{
    totalCheckIns: number;
    checkInsThisMonth: number;
    checkInsThisWeek: number;
    lastCheckIn: string | null;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [total, thisMonth, thisWeek, latest] = await Promise.all([
      this.checkInRepo.count({ where: { userId: this.userId, tenantId: this.tenantId } }),
      this.checkInRepo
        .createQueryBuilder('ci')
        .where('ci.userId = :userId AND ci.tenantId = :tenantId', {
          userId: this.userId,
          tenantId: this.tenantId,
        })
        .andWhere('ci.checkedInAt >= :start', { start: startOfMonth })
        .getCount(),
      this.checkInRepo
        .createQueryBuilder('ci')
        .where('ci.userId = :userId AND ci.tenantId = :tenantId', {
          userId: this.userId,
          tenantId: this.tenantId,
        })
        .andWhere('ci.checkedInAt >= :start', { start: startOfWeek })
        .getCount(),
      this.checkInRepo.findOne({
        where: { userId: this.userId, tenantId: this.tenantId },
        order: { checkedInAt: 'DESC' },
      }),
    ]);

    return {
      totalCheckIns: total,
      checkInsThisMonth: thisMonth,
      checkInsThisWeek: thisWeek,
      lastCheckIn: latest ? latest.checkedInAt.toISOString() : null,
    };
  }

  private toDto(ci: CheckIn): CheckInDto {
    return {
      id: String(ci.id),
      tenantId: ci.tenantId,
      type: ci.type,
      notes: ci.notes,
      checkedInAt: ci.checkedInAt.toISOString(),
      createdAt: ci.createdAt.toISOString(),
    };
  }
}
