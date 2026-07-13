import {
  Injectable,
  Inject,
  Scope,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { ClassSchedule } from './entities/class-schedule.entity';
import { ClassBooking } from '../bookings/entities/class-booking.entity';
import { TenantClassesService, ClassScheduleDto } from '../admin/tenant-classes.service';

export type { ClassScheduleDto };

@Injectable({ scope: Scope.REQUEST })
export class ClassSchedulesService {
  constructor(
    @InjectRepository(ClassSchedule)
    private readonly scheduleRepo: Repository<ClassSchedule>,
    @InjectRepository(ClassBooking)
    private readonly bookingRepo: Repository<ClassBooking>,
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

  async getUpcomingSchedules(limit = 50): Promise<ClassScheduleDto[]> {
    const tenantSchedules = await this.tenantClassesService.getUpcomingSchedules(
      this.tenantId,
      limit,
      this.userId,
    );
    if (tenantSchedules !== null) return tenantSchedules;

    return this.getCentralUpcomingSchedules(limit);
  }

  async getScheduleInfo(id: number): Promise<ClassScheduleDto> {
    const tenantSchedule = await this.tenantClassesService.getScheduleInfo(
      this.tenantId,
      id,
      this.userId,
    );
    if (tenantSchedule) return tenantSchedule;

    const schedule = await this.scheduleRepo.findOne({
      where: { id, tenantId: this.tenantId, isActive: true },
    });
    if (!schedule) {
      throw new NotFoundException(`Class schedule ${id} not found.`);
    }

    const booking = this.userId
      ? await this.bookingRepo.findOne({ where: { userId: this.userId, classScheduleId: id } })
      : null;

    return this.toCentralDto(schedule, !!(booking && booking.status !== 'cancelled'));
  }

  async getScheduleStatus(id: number): Promise<{ isBooked: boolean; slotsAvailable: boolean; availableSlots: number }> {
    const tenantStatus = await this.tenantClassesService.getScheduleStatus(
      this.tenantId,
      id,
      this.userId,
    );
    if (tenantStatus !== null) return tenantStatus;

    const schedule = await this.scheduleRepo.findOne({
      where: { id, tenantId: this.tenantId, isActive: true },
    });
    if (!schedule) {
      throw new NotFoundException(`Class schedule ${id} not found.`);
    }

    const booking = this.userId
      ? await this.bookingRepo.findOne({ where: { userId: this.userId, classScheduleId: id } })
      : null;

    const isBooked = !!(booking && booking.status !== 'cancelled');
    const availableSlots = schedule.maxCapacity - schedule.currentBookings;

    return {
      isBooked,
      slotsAvailable: availableSlots > 0,
      availableSlots: Math.max(0, availableSlots),
    };
  }

  async bookClass(id: number, userId: string): Promise<{ message: string; bookingId: string }> {
    if (await this.tenantClassesService.hasTenantDatabase(this.tenantId)) {
      return this.tenantClassesService.bookClass(this.tenantId, id, userId);
    }
    return this.bookCentralClass(id, userId);
  }

  // ─── Central DB fallback ─────────────────────────────────────────────────────

  private async getCentralUpcomingSchedules(limit: number): Promise<ClassScheduleDto[]> {
    const now = new Date();
    const schedules = await this.scheduleRepo.find({
      where: { tenantId: this.tenantId, isActive: true, startTime: MoreThan(now) },
      order: { startTime: 'ASC' },
      take: limit,
    });

    const userId = this.userId;
    const scheduleIds = schedules.map((s) => s.id);
    let bookedIds = new Set<number>();

    if (userId && scheduleIds.length > 0) {
      const bookings = await this.bookingRepo
        .createQueryBuilder('b')
        .where('b.userId = :userId AND b.classScheduleId IN (:...ids) AND b.status != :cancelled', {
          userId,
          ids: scheduleIds,
          cancelled: 'cancelled',
        })
        .getMany();
      bookedIds = new Set(bookings.map((b) => b.classScheduleId));
    }

    return schedules.map((s) => this.toCentralDto(s, bookedIds.has(s.id)));
  }

  private async bookCentralClass(id: number, userId: string): Promise<{ message: string; bookingId: string }> {
    const schedule = await this.scheduleRepo.findOne({
      where: { id, tenantId: this.tenantId, isActive: true },
    });

    if (!schedule) {
      throw new NotFoundException(`Class schedule ${id} not found.`);
    }

    if (new Date() > schedule.startTime) {
      throw new BadRequestException('Cannot book a class that has already started.');
    }

    const existing = await this.bookingRepo.findOne({
      where: { userId, classScheduleId: id, tenantId: this.tenantId },
    });

    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException('You already have a booking for this class.');
    }

    if (schedule.currentBookings >= schedule.maxCapacity) {
      throw new BadRequestException('This class is fully booked.');
    }

    if (existing && existing.status === 'cancelled') {
      existing.status = 'confirmed';
      existing.cancelledAt = null;
      existing.cancelReason = null;
      await this.bookingRepo.save(existing);
      await this.scheduleRepo.increment({ id }, 'currentBookings', 1);
      return { message: 'Class booked successfully.', bookingId: String(existing.id) };
    }

    const booking = this.bookingRepo.create({
      userId,
      tenantId: this.tenantId,
      classScheduleId: id,
      status: 'confirmed',
      bookedAt: new Date(),
    });
    const saved = await this.bookingRepo.save(booking);
    await this.scheduleRepo.increment({ id }, 'currentBookings', 1);

    return { message: 'Class booked successfully.', bookingId: String(saved.id) };
  }

  private toCentralDto(s: ClassSchedule, isBooked?: boolean): ClassScheduleDto {
    return {
      id: String(s.id),
      name: s.name,
      description: s.description,
      instructor: s.instructor,
      location: s.location,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      maxCapacity: s.maxCapacity,
      currentBookings: s.currentBookings,
      slotsAvailable: Math.max(0, s.maxCapacity - s.currentBookings),
      color: s.color,
      isBooked,
      isActive: !!s.isActive,
    };
  }
}
