import {
  Injectable,
  Inject,
  Scope,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { ClassBooking, BookingStatus } from './entities/class-booking.entity';
import { ClassSchedule } from '../class-schedules/entities/class-schedule.entity';
import { TenantClassesService, BookingDto } from '../admin/tenant-classes.service';

export type { BookingDto };

@Injectable({ scope: Scope.REQUEST })
export class BookingsService {
  constructor(
    @InjectRepository(ClassBooking)
    private readonly bookingRepo: Repository<ClassBooking>,
    @InjectRepository(ClassSchedule)
    private readonly scheduleRepo: Repository<ClassSchedule>,
    @Inject(REQUEST)
    private readonly request: any,
    private readonly tenantClassesService: TenantClassesService,
  ) {}

  private get userId(): string {
    return this.request.user?.sub;
  }

  private get tenantId(): string {
    return this.request.tenantId;
  }

  async getMyBookings(status?: BookingStatus, limit = 50): Promise<BookingDto[]> {
    const tenantBookings = await this.tenantClassesService.getUserBookings(
      this.tenantId,
      this.userId,
      status,
      limit,
    );
    if (tenantBookings !== null) return tenantBookings;

    return this.getCentralBookings(status, limit);
  }

  async cancelBooking(bookingId: number, reason?: string): Promise<{ message: string }> {
    if (await this.tenantClassesService.hasTenantDatabase(this.tenantId)) {
      return this.tenantClassesService.cancelBooking(
        this.tenantId,
        bookingId,
        this.userId,
        reason,
      );
    }
    return this.cancelCentralBooking(bookingId, reason);
  }

  // ─── Central DB fallback ─────────────────────────────────────────────────────

  private async getCentralBookings(status?: BookingStatus, limit = 50): Promise<BookingDto[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .where('b.userId = :userId AND b.tenantId = :tenantId', {
        userId: this.userId,
        tenantId: this.tenantId,
      })
      .orderBy('b.bookedAt', 'DESC')
      .take(limit);

    if (status) {
      qb.andWhere('b.status = :status', { status });
    }

    const bookings = await qb.getMany();
    const scheduleIds = [...new Set(bookings.map((b) => b.classScheduleId))];
    let scheduleMap = new Map<number, ClassSchedule>();

    if (scheduleIds.length > 0) {
      const schedules = await this.scheduleRepo
        .createQueryBuilder('cs')
        .where('cs.id IN (:...ids)', { ids: scheduleIds })
        .getMany();
      scheduleMap = new Map(schedules.map((s) => [s.id, s]));
    }

    return bookings.map((b) => {
      const schedule = scheduleMap.get(b.classScheduleId) ?? null;
      return this.toCentralDto(b, schedule);
    });
  }

  private async cancelCentralBooking(bookingId: number, reason?: string): Promise<{ message: string }> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId, userId: this.userId, tenantId: this.tenantId },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found.`);
    }

    if (booking.status === 'cancelled') {
      throw new BadRequestException('This booking is already cancelled.');
    }

    if (booking.status === 'attended') {
      throw new BadRequestException('Cannot cancel a class that has already been attended.');
    }

    const schedule = await this.scheduleRepo.findOne({ where: { id: booking.classScheduleId } });
    if (schedule && new Date() > schedule.startTime) {
      throw new BadRequestException('Cannot cancel a booking for a class that has already started.');
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelReason = reason ?? null;
    await this.bookingRepo.save(booking);

    if (schedule) {
      await this.scheduleRepo.decrement({ id: booking.classScheduleId }, 'currentBookings', 1);
    }

    return { message: 'Booking cancelled successfully.' };
  }

  private toCentralDto(b: ClassBooking, schedule: ClassSchedule | null): BookingDto {
    return {
      id: String(b.id),
      status: b.status,
      bookedAt: b.bookedAt.toISOString(),
      cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
      cancelReason: b.cancelReason,
      classSchedule: schedule
        ? {
            id: String(schedule.id),
            name: schedule.name,
            instructor: schedule.instructor,
            location: schedule.location,
            startTime: schedule.startTime.toISOString(),
            endTime: schedule.endTime.toISOString(),
            color: schedule.color,
          }
        : null,
    };
  }
}
