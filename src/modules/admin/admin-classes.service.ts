import {
  Injectable, Inject, Scope, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual } from 'typeorm';
import { ClassSchedule } from '../class-schedules/entities/class-schedule.entity';
import { CreateClassScheduleDto } from './dto/create-class-schedule.dto';
import { UpdateClassScheduleDto } from './dto/update-class-schedule.dto';
import { TenantClassesService, ClassScheduleDto } from './tenant-classes.service';

export type AdminClassScheduleDto = ClassScheduleDto;

@Injectable({ scope: Scope.REQUEST })
export class AdminClassesService {
  constructor(
    @InjectRepository(ClassSchedule)
    private readonly scheduleRepo: Repository<ClassSchedule>,
    @Inject(REQUEST)
    private readonly request: { tenantId?: string },
    private readonly tenantClassesService: TenantClassesService,
  ) {}

  private get tenantId(): string {
    if (!this.request.tenantId) {
      throw new NotFoundException('Contexte salle manquant.');
    }
    return this.request.tenantId;
  }

  async listClasses(
    page = 1,
    limit = 20,
    filter: 'all' | 'upcoming' | 'past' = 'all',
  ): Promise<{ data: AdminClassScheduleDto[]; meta: { total: number; page: number; limit: number; lastPage: number } }> {
    const tenantResult = await this.tenantClassesService.listClasses(this.tenantId, page, limit, filter);
    if (tenantResult !== null) return tenantResult;

    return this.listCentralClasses(page, limit, filter);
  }

  async getClass(id: number): Promise<AdminClassScheduleDto> {
    const tenantClass = await this.tenantClassesService.getClass(this.tenantId, id);
    if (tenantClass) return tenantClass;

    const schedule = await this.scheduleRepo.findOne({
      where: { id, tenantId: this.tenantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Class schedule ${id} not found.`);
    }
    return this.toCentralDto(schedule);
  }

  async createClass(dto: CreateClassScheduleDto): Promise<AdminClassScheduleDto> {
    if (await this.tenantClassesService.hasTenantDatabase(this.tenantId)) {
      return this.tenantClassesService.createClass(this.tenantId, dto);
    }
    return this.createCentralClass(dto);
  }

  async updateClass(id: number, dto: UpdateClassScheduleDto): Promise<AdminClassScheduleDto> {
    if (await this.tenantClassesService.hasTenantDatabase(this.tenantId)) {
      return this.tenantClassesService.updateClass(this.tenantId, id, dto);
    }
    return this.updateCentralClass(id, dto);
  }

  async deleteClass(id: number): Promise<{ message: string }> {
    if (await this.tenantClassesService.hasTenantDatabase(this.tenantId)) {
      return this.tenantClassesService.deleteClass(this.tenantId, id);
    }
    return this.deleteCentralClass(id);
  }

  // ─── Central DB fallback ─────────────────────────────────────────────────────

  private async listCentralClasses(
    page: number,
    limit: number,
    filter: 'all' | 'upcoming' | 'past',
  ) {
    const skip = (page - 1) * limit;
    const now = new Date();
    const tenantId = this.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (filter === 'upcoming') {
      where.startTime = MoreThan(now);
      where.isActive = true;
    } else if (filter === 'past') {
      where.startTime = LessThanOrEqual(now);
    }

    const [rows, total] = await this.scheduleRepo.findAndCount({
      where,
      order: { startTime: filter === 'past' ? 'DESC' : 'ASC' },
      skip,
      take: limit,
    });

    return {
      data: rows.map((s) => this.toCentralDto(s)),
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) || 1 },
    };
  }

  private async createCentralClass(dto: CreateClassScheduleDto): Promise<AdminClassScheduleDto> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.validateTimes(startTime, endTime);

    const schedule = this.scheduleRepo.create({
      tenantId: this.tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      instructor: dto.instructor?.trim() || null,
      location: dto.location?.trim() || null,
      startTime,
      endTime,
      maxCapacity: dto.maxCapacity,
      currentBookings: 0,
      isActive: true,
      color: dto.color ?? '#584CF4',
    });

    const saved = await this.scheduleRepo.save(schedule);
    return this.toCentralDto(saved);
  }

  private async updateCentralClass(id: number, dto: UpdateClassScheduleDto): Promise<AdminClassScheduleDto> {
    const schedule = await this.scheduleRepo.findOne({
      where: { id, tenantId: this.tenantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Class schedule ${id} not found.`);
    }

    const startTime = dto.startTime ? new Date(dto.startTime) : schedule.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : schedule.endTime;
    if (dto.startTime || dto.endTime) this.validateTimes(startTime, endTime);

    if (dto.maxCapacity !== undefined && dto.maxCapacity < schedule.currentBookings) {
      throw new BadRequestException(
        `La capacité ne peut pas être inférieure aux réservations actuelles (${schedule.currentBookings}).`,
      );
    }

    if (dto.name !== undefined) schedule.name = dto.name.trim();
    if (dto.description !== undefined) schedule.description = dto.description?.trim() || null;
    if (dto.instructor !== undefined) schedule.instructor = dto.instructor?.trim() || null;
    if (dto.location !== undefined) schedule.location = dto.location?.trim() || null;
    if (dto.startTime) schedule.startTime = startTime;
    if (dto.endTime) schedule.endTime = endTime;
    if (dto.maxCapacity !== undefined) schedule.maxCapacity = dto.maxCapacity;
    if (dto.color !== undefined) schedule.color = dto.color;
    if (dto.isActive !== undefined) schedule.isActive = dto.isActive;

    const saved = await this.scheduleRepo.save(schedule);
    return this.toCentralDto(saved);
  }

  private async deleteCentralClass(id: number): Promise<{ message: string }> {
    const schedule = await this.scheduleRepo.findOne({
      where: { id, tenantId: this.tenantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Class schedule ${id} not found.`);
    }
    schedule.isActive = false;
    await this.scheduleRepo.save(schedule);
    return { message: 'Class deactivated successfully.' };
  }

  private validateTimes(startTime: Date, endTime: Date) {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Dates invalides.');
    }
    if (endTime <= startTime) {
      throw new BadRequestException('La fin du cours doit être après le début.');
    }
  }

  private toCentralDto(s: ClassSchedule): AdminClassScheduleDto {
    const now = new Date();
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
      isActive: !!s.isActive,
      isPast: s.startTime <= now,
    };
  }
}
