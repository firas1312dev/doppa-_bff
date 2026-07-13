import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BookingsService, BookingDto } from './bookings.service';
import type { BookingStatus } from './entities/class-booking.entity';
import { IsOptional, IsString } from 'class-validator';

class CancelBookingDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

@Controller({ path: 'bookings', version: '1' })
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  getMyBookings(
    @Query('status') status?: BookingStatus,
    @Query('limit') limit?: string,
  ): Promise<BookingDto[]> {
    return this.bookingsService.getMyBookings(status, limit ? parseInt(limit, 10) : 50);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelBooking(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelBooking(id, dto.reason);
  }
}
