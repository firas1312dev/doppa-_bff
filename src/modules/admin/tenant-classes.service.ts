import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BookingStatus } from '../bookings/entities/class-booking.entity';
import { CreateClassScheduleDto } from './dto/create-class-schedule.dto';
import { UpdateClassScheduleDto } from './dto/update-class-schedule.dto';
import { TenantMembersService, parseTenantMemberGlobalId } from './tenant-members.service';

export interface ClassScheduleDto {
  id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  maxCapacity: number;
  currentBookings: number;
  slotsAvailable: number;
  color: string | null;
  isActive: boolean;
  isPast?: boolean;
  isBooked?: boolean;
  isScheduled?: boolean;
  classListId?: number;
  source?: 'tenant' | 'central';
}

export interface BookingDto {
  id: string;
  status: BookingStatus;
  bookedAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  classSchedule: {
    id: string;
    name: string;
    instructor: string | null;
    location: string | null;
    startTime: string;
    endTime: string;
    color: string | null;
  } | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Injectable()
export class TenantClassesService {
  private readonly logger = new Logger(TenantClassesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantMembersService: TenantMembersService,
  ) {}

  async hasTenantDatabase(tenantId: string): Promise<boolean> {
    return this.tenantMembersService.hasTenantDatabase(tenantId);
  }

  async listClasses(
    tenantId: string,
    page = 1,
    limit = 20,
    filter: 'all' | 'upcoming' | 'past' = 'all',
  ): Promise<{ data: ClassScheduleDto[]; meta: { total: number; page: number; limit: number; lastPage: number } } | null> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) return null;

    const offset = (page - 1) * limit;
    const startExpr = this.scheduleStartAtExpr('cs');
    const conditions = [this.activeScheduleCondition('cs')];
    const params: unknown[] = [];

    if (filter === 'upcoming') {
      conditions.push(`${startExpr} IS NOT NULL`);
      conditions.push(`${startExpr} > NOW()`);
    } else if (filter === 'past') {
      conditions.push(`${startExpr} IS NOT NULL`);
      conditions.push(`${startExpr} <= NOW()`);
    }

    const where = conditions.join(' AND ');
    const order = filter === 'past' ? 'DESC' : 'ASC';

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM \`${dbName}\`.class_schedules cs WHERE ${where}`,
      params,
    );
    let total = parseInt(countRows?.[0]?.cnt ?? '0', 10);

    const rows = await this.dataSource.query(
      `${this.scheduleSelectSql(dbName)}
       WHERE ${where}
       ORDER BY ${startExpr} ${order}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    let data = rows.map((r: Record<string, unknown>) => this.mapScheduleRow(r));

    // Cours créés sur le web = class_lists sans horaire planifié (page 1 uniquement)
    if (page === 1 && (filter === 'all' || filter === 'upcoming')) {
      const unscheduled = await this.listUnscheduledClassLists(dbName);
      data = [...data, ...unscheduled];
      total += unscheduled.length;
    }

    if (page === 1) {
      const central = await this.listCentralClasses(tenantId, filter, limit);
      if (central.length > 0) {
        const existingIds = new Set(data.map((d) => d.id));
        const merged = central.filter((c) => !existingIds.has(c.id));
        data = [...data, ...merged].sort((a, b) => {
          if (!a.startTime) return 1;
          if (!b.startTime) return -1;
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        total += merged.length;
      }
    }

    return {
      data,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) || 1 },
    };
  }

  async getClass(tenantId: string, scheduleId: number): Promise<ClassScheduleDto | null> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) return null;

    const rows = await this.dataSource.query(
      `${this.scheduleSelectSql(dbName)} WHERE cs.id = ? AND cs.deleted_at IS NULL LIMIT 1`,
      [scheduleId],
    );
    if (!rows?.[0]) return null;
    return this.mapScheduleRow(rows[0]);
  }

  async createClass(tenantId: string, dto: CreateClassScheduleDto): Promise<ClassScheduleDto> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) throw new NotFoundException('Base salle introuvable.');

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    this.validateTimes(start, end);

    const classId = await this.findOrCreateClassList(dbName, dto.name.trim(), dto.maxCapacity, dto.description);
    const locationId = dto.location?.trim()
      ? await this.findOrCreateLocation(dbName, dto.location.trim())
      : null;
    const instructorId = dto.instructor?.trim()
      ? await this.resolveInstructorId(dbName, dto.instructor.trim())
      : null;

    const result = await this.dataSource.query(
      `INSERT INTO \`${dbName}\`.class_schedules
         (day, date_at, start_at, end_at, class_id, location_id, instructor_id, capacity, is_active, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [
        DAYS[start.getDay()],
        this.formatDateOnly(start),
        this.formatTimeOnly(start),
        this.formatTimeOnly(end),
        classId,
        locationId,
        instructorId,
        dto.maxCapacity,
        dto.description?.trim() || null,
      ],
    );

    const created = await this.getClass(tenantId, Number(result.insertId));
    if (!created) throw new NotFoundException('Cours créé mais introuvable.');
    return created;
  }

  async updateClass(
    tenantId: string,
    scheduleId: number,
    dto: UpdateClassScheduleDto,
  ): Promise<ClassScheduleDto> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) throw new NotFoundException('Base salle introuvable.');

    const existing = await this.getClass(tenantId, scheduleId);
    if (!existing) throw new NotFoundException(`Class schedule ${scheduleId} not found.`);

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) {
      const classId = await this.findOrCreateClassList(dbName, dto.name.trim(), dto.maxCapacity ?? existing.maxCapacity);
      sets.push('class_id = ?');
      params.push(classId);
    }

    if (dto.startTime) {
      const start = new Date(dto.startTime);
      sets.push('date_at = ?', 'start_at = ?', 'day = ?');
      params.push(this.formatDateOnly(start), this.formatTimeOnly(start), DAYS[start.getDay()]);
    }
    if (dto.endTime) {
      sets.push('end_at = ?');
      params.push(this.formatTimeOnly(new Date(dto.endTime)));
    }
    if (dto.maxCapacity !== undefined) {
      if (dto.maxCapacity < existing.currentBookings) {
        throw new BadRequestException(
          `La capacité ne peut pas être inférieure aux réservations actuelles (${existing.currentBookings}).`,
        );
      }
      sets.push('capacity = ?');
      params.push(dto.maxCapacity);
    }
    if (dto.instructor !== undefined) {
      const instructorId = dto.instructor?.trim()
        ? await this.resolveInstructorId(dbName, dto.instructor.trim())
        : null;
      sets.push('instructor_id = ?');
      params.push(instructorId);
    }
    if (dto.location !== undefined) {
      const locationId = dto.location?.trim()
        ? await this.findOrCreateLocation(dbName, dto.location.trim())
        : null;
      sets.push('location_id = ?');
      params.push(locationId);
    }
    if (dto.description !== undefined) {
      sets.push('note = ?');
      params.push(dto.description?.trim() || null);
    }
    if (dto.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(dto.isActive ? 1 : 0);
    }

    if (sets.length > 0) {
      params.push(scheduleId);
      await this.dataSource.query(
        `UPDATE \`${dbName}\`.class_schedules SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
        params,
      );
    }

    const updated = await this.getClass(tenantId, scheduleId);
    if (!updated) throw new NotFoundException(`Class schedule ${scheduleId} not found.`);
    return updated;
  }

  async deleteClass(tenantId: string, scheduleId: number): Promise<{ message: string }> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) throw new NotFoundException('Base salle introuvable.');

    const result = await this.dataSource.query(
      `UPDATE \`${dbName}\`.class_schedules SET is_active = 0, deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [scheduleId],
    );
    if (result.affectedRows === 0) {
      throw new NotFoundException(`Class schedule ${scheduleId} not found.`);
    }
    return { message: 'Class deactivated successfully.' };
  }

  async getUpcomingSchedules(
    tenantId: string,
    limit = 50,
    userGlobalId?: string,
  ): Promise<ClassScheduleDto[] | null> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) return null;

    const startExpr = this.scheduleStartAtExpr('cs');
    const rows = await this.dataSource.query(
      `${this.scheduleSelectSql(dbName)}
       WHERE ${this.activeScheduleCondition('cs')}
         AND ${startExpr} IS NOT NULL
         AND ${startExpr} > NOW()
       ORDER BY ${startExpr} ASC
       LIMIT ?`,
      [limit],
    );

    const recurring = await this.fetchRecurringSchedules(dbName);
    const expanded = this.expandRecurringSchedules(recurring);

    const bookedIds = userGlobalId
      ? await this.getUserBookedScheduleIds(dbName, tenantId, userGlobalId)
      : new Set<number>();

    const tenantItems = [...rows.map((r: Record<string, unknown>) => {
      const dto = this.mapScheduleRow(r);
      dto.isBooked = bookedIds.has(Number(r.id));
      return dto;
    }), ...expanded.map((dto) => {
      dto.isBooked = bookedIds.has(Number(dto.id));
      return dto;
    })];

    const central = await this.listCentralClasses(tenantId, 'upcoming', limit);
    const merged = [...tenantItems, ...central]
      .filter((item) => item.startTime && new Date(item.startTime) > new Date())
      .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime())
      .slice(0, limit);

    return merged;
  }

  async getScheduleInfo(
    tenantId: string,
    scheduleId: number,
    userGlobalId?: string,
  ): Promise<ClassScheduleDto | null> {
    const schedule = await this.getClass(tenantId, scheduleId);
    if (!schedule || !schedule.isActive) return null;

    if (userGlobalId) {
      const dbName = await this.resolveDb(tenantId);
      if (dbName) {
        const bookedIds = await this.getUserBookedScheduleIds(dbName, tenantId, userGlobalId);
        schedule.isBooked = bookedIds.has(scheduleId);
      }
    }
    return schedule;
  }

  async getScheduleStatus(
    tenantId: string,
    scheduleId: number,
    userGlobalId?: string,
  ): Promise<{ isBooked: boolean; slotsAvailable: boolean; availableSlots: number } | null> {
    const schedule = await this.getClass(tenantId, scheduleId);
    if (!schedule || !schedule.isActive) return null;

    let isBooked = false;
    if (userGlobalId) {
      const dbName = await this.resolveDb(tenantId);
      if (dbName) {
        const bookedIds = await this.getUserBookedScheduleIds(dbName, tenantId, userGlobalId);
        isBooked = bookedIds.has(scheduleId);
      }
    }

    return {
      isBooked,
      slotsAvailable: schedule.slotsAvailable > 0,
      availableSlots: schedule.slotsAvailable,
    };
  }

  async bookClass(
    tenantId: string,
    scheduleId: number,
    userGlobalId: string,
  ): Promise<{ message: string; bookingId: string }> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) throw new NotFoundException('Base salle introuvable.');

    const schedule = await this.getClass(tenantId, scheduleId);
    if (!schedule || !schedule.isActive) {
      throw new NotFoundException(`Class schedule ${scheduleId} not found.`);
    }

    if (schedule.startTime && new Date() > new Date(schedule.startTime)) {
      throw new BadRequestException('Cannot book a class that has already started.');
    }

    const localUserId = await this.resolveTenantUserLocalId(dbName, tenantId, userGlobalId);
    if (!localUserId) {
      throw new NotFoundException('Membre introuvable dans cette salle.');
    }

    const existing = await this.dataSource.query(
      `SELECT id, canceled_at FROM \`${dbName}\`.bookings
       WHERE user_id = ? AND schedule_id = ? AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [localUserId, scheduleId],
    );

    const row = existing?.[0];
    if (row && !row.canceled_at) {
      throw new ConflictException('You already have a booking for this class.');
    }

    if (schedule.slotsAvailable <= 0) {
      throw new BadRequestException('This class is fully booked.');
    }

    if (row?.canceled_at) {
      await this.dataSource.query(
        `UPDATE \`${dbName}\`.bookings
         SET canceled_at = NULL, status = 1, is_standby = 0, schedules_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [row.id],
      );
      return { message: 'Class booked successfully.', bookingId: String(row.id) };
    }

    const result = await this.dataSource.query(
      `INSERT INTO \`${dbName}\`.bookings
         (user_id, schedule_id, is_standby, attendance, status, source, schedules_at, created_at, updated_at)
       VALUES (?, ?, 0, 0, 1, 1, NOW(), NOW(), NOW())`,
      [localUserId, scheduleId],
    );

    return { message: 'Class booked successfully.', bookingId: String(result.insertId) };
  }

  async getUserBookings(
    tenantId: string,
    userGlobalId: string,
    status?: BookingStatus,
    limit = 50,
  ): Promise<BookingDto[] | null> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) return null;

    const localUserId = await this.resolveTenantUserLocalId(dbName, tenantId, userGlobalId);
    if (!localUserId) return [];

    const conditions = ['b.user_id = ?', 'b.deleted_at IS NULL'];
    const params: unknown[] = [localUserId];

    if (status === 'cancelled') {
      conditions.push('b.canceled_at IS NOT NULL');
    } else if (status === 'confirmed') {
      conditions.push('b.canceled_at IS NULL');
      conditions.push('(b.is_standby = 0 OR b.is_standby IS NULL)');
      conditions.push('(b.attendance = 0 OR b.attendance IS NULL)');
    } else if (status === 'pending') {
      conditions.push('b.canceled_at IS NULL AND b.is_standby = 1');
    } else if (status === 'attended') {
      conditions.push('b.canceled_at IS NULL AND b.attendance = 1');
    }

    const rows = await this.dataSource.query(
      `SELECT
         b.id, b.status, b.is_standby, b.attendance, b.source,
         b.schedules_at, b.canceled_at, b.created_at,
         cs.id AS schedule_id, cs.date_at, cs.start_at, cs.end_at,
         cl.name AS class_name,
         CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.last_name,'')) AS instructor_name,
         l.label AS location_label
       FROM \`${dbName}\`.bookings b
       INNER JOIN \`${dbName}\`.class_schedules cs ON cs.id = b.schedule_id
       LEFT JOIN \`${dbName}\`.class_lists cl ON cl.id = cs.class_id
       LEFT JOIN \`${dbName}\`.admins a ON a.id = cs.instructor_id
       LEFT JOIN \`${dbName}\`.locations l ON l.id = cs.location_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(b.schedules_at, b.created_at) DESC
       LIMIT ?`,
      [...params, limit],
    );

    return rows.map((r: Record<string, unknown>) => this.mapBookingRow(r));
  }

  async cancelBooking(
    tenantId: string,
    bookingId: number,
    userGlobalId: string,
    reason?: string,
  ): Promise<{ message: string }> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) throw new NotFoundException('Base salle introuvable.');

    const localUserId = await this.resolveTenantUserLocalId(dbName, tenantId, userGlobalId);
    if (!localUserId) throw new NotFoundException(`Booking ${bookingId} not found.`);

    const rows = await this.dataSource.query(
      `SELECT b.id, b.canceled_at, b.attendance, cs.date_at, cs.start_at
       FROM \`${dbName}\`.bookings b
       INNER JOIN \`${dbName}\`.class_schedules cs ON cs.id = b.schedule_id
       WHERE b.id = ? AND b.user_id = ? AND b.deleted_at IS NULL LIMIT 1`,
      [bookingId, localUserId],
    );
    const booking = rows?.[0];
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found.`);

    if (booking.canceled_at) {
      throw new BadRequestException('This booking is already cancelled.');
    }
    if (booking.attendance) {
      throw new BadRequestException('Cannot cancel a class that has already been attended.');
    }

    const startTime = this.combineDateTime(booking.date_at, String(booking.start_at));
    if (new Date() > startTime) {
      throw new BadRequestException('Cannot cancel a booking for a class that has already started.');
    }

    await this.dataSource.query(
      `UPDATE \`${dbName}\`.bookings SET canceled_at = NOW(), status = 0, updated_at = NOW() WHERE id = ?`,
      [bookingId],
    );

    return { message: 'Booking cancelled successfully.' };
  }

  async countMonthlyBookings(tenantId: string): Promise<{ online: number; manual: number } | null> {
    const dbName = await this.resolveDb(tenantId);
    if (!dbName) return null;

    const rows = await this.dataSource.query(
      `SELECT
         SUM(CASE WHEN b.source = 1 AND b.canceled_at IS NULL THEN 1 ELSE 0 END) AS online_cnt,
         SUM(CASE WHEN (b.source IS NULL OR b.source <> 1) AND b.canceled_at IS NULL THEN 1 ELSE 0 END) AS manual_cnt
       FROM \`${dbName}\`.bookings b
       WHERE b.deleted_at IS NULL
         AND MONTH(b.created_at) = MONTH(NOW())
         AND YEAR(b.created_at) = YEAR(NOW())`,
    );

    return {
      online: parseInt(rows?.[0]?.online_cnt ?? '0', 10),
      manual: parseInt(rows?.[0]?.manual_cnt ?? '0', 10),
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Expression SQL compatible web Laravel (date_at + start_at, ou datetime complet). */
  private scheduleStartAtExpr(alias = 'cs'): string {
    return `CASE
      WHEN ${alias}.start_at REGEXP '^[0-9]{4}-' THEN CAST(${alias}.start_at AS DATETIME)
      WHEN ${alias}.date_at IS NOT NULL AND ${alias}.start_at IS NOT NULL AND ${alias}.start_at <> ''
        THEN TIMESTAMP(DATE(${alias}.date_at), TIME(STR_TO_DATE(${alias}.start_at, '%H:%i:%s')))
      WHEN ${alias}.date_at IS NOT NULL AND ${alias}.start_at IS NOT NULL
        THEN TIMESTAMP(DATE(${alias}.date_at), TIME(STR_TO_DATE(CONCAT(${alias}.start_at, ':00'), '%H:%i:%s')))
      ELSE ${alias}.date_at
    END`;
  }

  private scheduleEndAtExpr(alias = 'cs'): string {
    return `CASE
      WHEN ${alias}.end_at REGEXP '^[0-9]{4}-' THEN CAST(${alias}.end_at AS DATETIME)
      WHEN ${alias}.date_at IS NOT NULL AND ${alias}.end_at IS NOT NULL AND ${alias}.end_at <> ''
        THEN TIMESTAMP(DATE(${alias}.date_at), TIME(STR_TO_DATE(${alias}.end_at, '%H:%i:%s')))
      WHEN ${alias}.date_at IS NOT NULL AND ${alias}.end_at IS NOT NULL
        THEN TIMESTAMP(DATE(${alias}.date_at), TIME(STR_TO_DATE(CONCAT(${alias}.end_at, ':00'), '%H:%i:%s')))
      WHEN ${alias}.date_at IS NOT NULL AND ${alias}.start_at IS NOT NULL
        THEN TIMESTAMP(DATE(${alias}.date_at), TIME(STR_TO_DATE(${alias}.start_at, '%H:%i:%s')))
      ELSE ${alias}.date_at
    END`;
  }

  private activeScheduleCondition(alias = 'cs'): string {
    return `${alias}.deleted_at IS NULL AND COALESCE(${alias}.is_active, 1) = 1`;
  }

  /** Cours créés sur le web (class_lists) sans créneau planifié. */
  private async listUnscheduledClassLists(dbName: string): Promise<ClassScheduleDto[]> {
    const rows = await this.dataSource.query(
      `SELECT cl.id, cl.name, cl.capacity, cl.description
       FROM \`${dbName}\`.class_lists cl
       WHERE cl.deleted_at IS NULL AND COALESCE(cl.is_active, 1) = 1
         AND NOT EXISTS (
           SELECT 1 FROM \`${dbName}\`.class_schedules cs
           WHERE cs.class_id = cl.id AND cs.deleted_at IS NULL
         )
       ORDER BY cl.created_at DESC`,
    );

    return rows.map((row: Record<string, unknown>) => ({
      id: `clist:${row.id}`,
      classListId: Number(row.id),
      name: String(row.name ?? 'Cours'),
      description: row.description ? String(row.description) : null,
      instructor: null,
      location: null,
      startTime: null,
      endTime: null,
      maxCapacity: parseInt(String(row.capacity ?? '20'), 10) || 20,
      currentBookings: 0,
      slotsAvailable: parseInt(String(row.capacity ?? '20'), 10) || 20,
      color: '#584CF4',
      isActive: true,
      isScheduled: false,
      isPast: false,
      source: 'tenant' as const,
    }));
  }

  /** Cours legacy dans la base centrale (avant branchement tenant). */
  private async listCentralClasses(
    tenantId: string,
    filter: 'all' | 'upcoming' | 'past',
    limit = 50,
  ): Promise<ClassScheduleDto[]> {
    const conditions = ['tenant_id = ?', 'is_active = 1'];
    const params: unknown[] = [tenantId];

    if (filter === 'upcoming') {
      conditions.push('start_time > NOW()');
    } else if (filter === 'past') {
      conditions.push('start_time <= NOW()');
    }

    const rows = await this.dataSource.query(
      `SELECT id, name, description, instructor, location, start_time, end_time,
              max_capacity, current_bookings, color, is_active
       FROM class_schedules
       WHERE ${conditions.join(' AND ')}
       ORDER BY start_time ASC
       LIMIT ?`,
      [...params, limit],
    );

    const now = new Date();
    return rows.map((row: Record<string, unknown>) => {
      const startTime = new Date(String(row.start_time));
      const endTime = new Date(String(row.end_time));
      const maxCapacity = parseInt(String(row.max_capacity ?? '0'), 10) || 0;
      const currentBookings = parseInt(String(row.current_bookings ?? '0'), 10) || 0;
      return {
        id: `central:${row.id}`,
        name: String(row.name ?? 'Cours'),
        description: row.description ? String(row.description) : null,
        instructor: row.instructor ? String(row.instructor) : null,
        location: row.location ? String(row.location) : null,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        maxCapacity,
        currentBookings,
        slotsAvailable: Math.max(0, maxCapacity - currentBookings),
        color: row.color ? String(row.color) : '#584CF4',
        isActive: !!row.is_active,
        isScheduled: true,
        isPast: startTime <= now,
        source: 'central' as const,
      };
    });
  }

  /** Cours récurrents web (start_of_week + day, sans date_at). */
  private async fetchRecurringSchedules(dbName: string): Promise<Record<string, unknown>[]> {
    const rows = await this.dataSource.query(
      `${this.scheduleSelectSql(dbName)}
       WHERE ${this.activeScheduleCondition('cs')}
         AND cs.date_at IS NULL
         AND cs.start_of_week IS NOT NULL
         AND cs.day IS NOT NULL
         AND cs.start_at IS NOT NULL`,
    );
    return rows;
  }

  private expandRecurringSchedules(rows: Record<string, unknown>[]): ClassScheduleDto[] {
    const dayIndex: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const now = new Date();
    const results: ClassScheduleDto[] = [];

    for (const row of rows) {
      const targetDay = dayIndex[String(row.day ?? '').toLowerCase()];
      if (targetDay === undefined) continue;

      const startTimeStr = String(row.start_at ?? '09:00:00');
      const endTimeStr = String(row.end_at ?? startTimeStr);
      const weekStart = new Date(String(row.start_of_week));

      for (let w = 0; w < 8; w += 1) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + w * 7);
        const currentDay = d.getDay();
        const diff = (targetDay - currentDay + 7) % 7;
        d.setDate(d.getDate() + diff);

        const start = this.combineDateTime(d, startTimeStr);
        const end = this.combineDateTime(d, endTimeStr);
        if (start <= now) continue;

        const dto = this.mapScheduleRow({
          ...row,
          date_at: this.formatDateOnly(d),
          start_at: startTimeStr,
          end_at: endTimeStr,
        });
        dto.isScheduled = true;
        results.push(dto);
        break;
      }
    }

    return results;
  }

  private async resolveDb(tenantId: string): Promise<string | null> {
    const { dbName } = await this.tenantMembersService.resolveTenantDatabase(tenantId);
    if (!dbName) return null;
    const exists = await this.tenantMembersService.hasTenantDatabase(tenantId);
    return exists ? dbName : null;
  }

  private scheduleSelectSql(dbName: string): string {
    return `
      SELECT
        cs.id,
        cs.date_at,
        cs.start_at,
        cs.end_at,
        cs.day,
        cs.start_of_week,
        cs.capacity,
        cs.is_active,
        cs.note,
        cl.name AS class_name,
        cl.description AS class_description,
        CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.last_name,'')) AS instructor_name,
        l.label AS location_label,
        (
          SELECT COUNT(*) FROM \`${dbName}\`.bookings b
          WHERE b.schedule_id = cs.id AND b.deleted_at IS NULL AND b.canceled_at IS NULL
        ) AS current_bookings
      FROM \`${dbName}\`.class_schedules cs
      LEFT JOIN \`${dbName}\`.class_lists cl ON cl.id = cs.class_id AND cl.deleted_at IS NULL
      LEFT JOIN \`${dbName}\`.admins a ON a.id = cs.instructor_id
      LEFT JOIN \`${dbName}\`.locations l ON l.id = cs.location_id AND l.deleted_at IS NULL`;
  }

  private mapScheduleRow(row: Record<string, unknown>): ClassScheduleDto {
    const startTime = row.date_at || row.start_at
      ? this.combineDateTime(row.date_at ?? new Date(), String(row.start_at ?? '00:00'))
      : null;
    const endTime = row.date_at || row.end_at || row.start_at
      ? this.combineDateTime(row.date_at ?? new Date(), String(row.end_at ?? row.start_at ?? '00:00'))
      : null;
    const maxCapacity = parseInt(String(row.capacity ?? '0'), 10) || 0;
    const currentBookings = parseInt(String(row.current_bookings ?? '0'), 10) || 0;
    const instructor = String(row.instructor_name ?? '').trim() || null;

    return {
      id: String(row.id),
      name: String(row.class_name ?? row.note ?? 'Cours'),
      description: row.class_description ? String(row.class_description) : (row.note ? String(row.note) : null),
      instructor,
      location: row.location_label ? String(row.location_label) : null,
      startTime: startTime ? startTime.toISOString() : null,
      endTime: endTime ? endTime.toISOString() : null,
      maxCapacity,
      currentBookings,
      slotsAvailable: Math.max(0, maxCapacity - currentBookings),
      color: '#584CF4',
      isActive: row.is_active === undefined || row.is_active === null ? true : !!row.is_active,
      isScheduled: true,
      isPast: startTime ? startTime <= new Date() : false,
      source: 'tenant',
    };
  }

  private mapBookingRow(row: Record<string, unknown>): BookingDto {
    const startTime = this.combineDateTime(row.date_at, String(row.start_at ?? '00:00'));
    const endTime = this.combineDateTime(row.date_at, String(row.end_at ?? row.start_at ?? '00:00'));
    const instructor = String(row.instructor_name ?? '').trim() || null;

    return {
      id: String(row.id),
      status: this.mapBookingStatus(row),
      bookedAt: new Date(String(row.schedules_at ?? row.created_at)).toISOString(),
      cancelledAt: row.canceled_at ? new Date(String(row.canceled_at)).toISOString() : null,
      cancelReason: null,
      classSchedule: {
        id: String(row.schedule_id),
        name: String(row.class_name ?? 'Cours'),
        instructor,
        location: row.location_label ? String(row.location_label) : null,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        color: '#584CF4',
      },
    };
  }

  private mapBookingStatus(row: Record<string, unknown>): BookingStatus {
    if (row.canceled_at) return 'cancelled';
    if (row.attendance) return 'attended';
    if (row.is_standby) return 'pending';
    return 'confirmed';
  }

  private async resolveTenantUserLocalId(
    dbName: string,
    tenantId: string,
    globalId: string,
  ): Promise<number | null> {
    const parsed = parseTenantMemberGlobalId(globalId);
    if (parsed && parsed.tenantId === tenantId) {
      return parsed.localId;
    }

    const rows = await this.dataSource.query(
      `SELECT id FROM \`${dbName}\`.users WHERE global_id = ? AND deleted_at IS NULL LIMIT 1`,
      [globalId],
    );
    if (rows?.[0]?.id) return Number(rows[0].id);

    return null;
  }

  private async getUserBookedScheduleIds(
    dbName: string,
    tenantId: string,
    userGlobalId: string,
  ): Promise<Set<number>> {
    const localUserId = await this.resolveTenantUserLocalId(dbName, tenantId, userGlobalId);
    if (!localUserId) return new Set();

    const rows = await this.dataSource.query(
      `SELECT schedule_id FROM \`${dbName}\`.bookings
       WHERE user_id = ? AND deleted_at IS NULL AND canceled_at IS NULL`,
      [localUserId],
    );
    return new Set(rows.map((r: { schedule_id: number }) => Number(r.schedule_id)));
  }

  private async findOrCreateClassList(
    dbName: string,
    name: string,
    capacity: number,
    description?: string,
  ): Promise<number> {
    const existing = await this.dataSource.query(
      `SELECT id FROM \`${dbName}\`.class_lists WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
      [name],
    );
    if (existing?.[0]?.id) return Number(existing[0].id);

    const result = await this.dataSource.query(
      `INSERT INTO \`${dbName}\`.class_lists
         (name, capacity, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, NOW(), NOW())`,
      [name, capacity, description?.trim() || null],
    );
    this.logger.log(`Created class_list "${name}" in ${dbName}`);
    return Number(result.insertId);
  }

  private async findOrCreateLocation(dbName: string, label: string): Promise<number> {
    const existing = await this.dataSource.query(
      `SELECT id FROM \`${dbName}\`.locations WHERE label = ? AND deleted_at IS NULL LIMIT 1`,
      [label],
    );
    if (existing?.[0]?.id) return Number(existing[0].id);

    const result = await this.dataSource.query(
      `INSERT INTO \`${dbName}\`.locations (label, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())`,
      [label],
    );
    return Number(result.insertId);
  }

  private async resolveInstructorId(dbName: string, name: string): Promise<number | null> {
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ?? '';
    const last = parts.slice(1).join(' ');

    let rows: Array<{ id: number }>;
    if (last) {
      rows = await this.dataSource.query(
        `SELECT id FROM \`${dbName}\`.admins
         WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
         LIMIT 1`,
        [first, last],
      );
    } else {
      rows = await this.dataSource.query(
        `SELECT id FROM \`${dbName}\`.admins
         WHERE LOWER(CONCAT(first_name, ' ', last_name)) LIKE ?
         LIMIT 1`,
        [`%${name.toLowerCase()}%`],
      );
    }
    return rows?.[0]?.id ? Number(rows[0].id) : null;
  }

  private combineDateTime(dateAt: unknown, timeStr: string): Date {
    if (timeStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(timeStr);
    }
    const base = dateAt ? new Date(String(dateAt)) : new Date();
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      base.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
    }
    return base;
  }

  private formatDateOnly(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatTimeOnly(d: Date): string {
    return d.toTimeString().slice(0, 8);
  }

  private validateTimes(startTime: Date, endTime: Date) {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Dates invalides.');
    }
    if (endTime <= startTime) {
      throw new BadRequestException('La fin du cours doit être après le début.');
    }
  }
}
