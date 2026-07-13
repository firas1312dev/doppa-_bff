import {
  Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * Stub endpoints for tenant-specific features not yet available in the central DB.
 * These tables exist in per-tenant databases (future architecture).
 * Returning empty arrays keeps mobile screens functional without errors.
 */
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard)
export class TenantFeaturesController {

  // ── Check-ins ───────────────────────────────────────────────────────────────

  @Get('checkins')
  getCheckins() {
    return [];
  }

  // ── Class schedules ─────────────────────────────────────────────────────────

  @Get('class-schedules')
  getClassSchedules() {
    return [];
  }

  @Get('class-schedules/:id/info')
  getClassScheduleInfo(@Param('id') _id: string) {
    return null;
  }

  @Get('class-schedules/:id/status')
  getClassScheduleStatus(@Param('id') _id: string) {
    return { isBooked: false, slotsAvailable: false };
  }

  @Post('class-schedules/:id')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  bookClass() {
    return { message: 'Class booking is not yet available in this version.' };
  }

  // ── Bookings ─────────────────────────────────────────────────────────────────

  @Get('bookings')
  getBookings() {
    return [];
  }

  @Post('bookings/:id/cancel')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  cancelBooking() {
    return { message: 'Booking cancellation is not yet available in this version.' };
  }
}
