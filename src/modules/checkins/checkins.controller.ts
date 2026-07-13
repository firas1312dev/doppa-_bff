import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveUser, ActiveUserData } from '../../common/decorators/active-user.decorator';
import { CheckInsService } from './checkins.service';
import { IsEnum, IsOptional, IsString } from 'class-validator';

class CreateCheckInDto {
  @IsEnum(['manual', 'qr', 'auto'])
  @IsOptional()
  type?: 'manual' | 'qr' | 'auto';

  @IsString()
  @IsOptional()
  notes?: string;
}

@Controller({ path: 'checkins', version: '1' })
@UseGuards(JwtAuthGuard)
export class CheckInsController {
  constructor(private readonly checkInsService: CheckInsService) {}

  @Get()
  getMyCheckIns(@Query('limit') limit?: string) {
    return this.checkInsService.getMyCheckIns(limit ? parseInt(limit, 10) : 20);
  }

  @Get('stats')
  getCheckInStats() {
    return this.checkInsService.getCheckInStats();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createCheckIn(@Body() dto: CreateCheckInDto) {
    return this.checkInsService.createCheckIn(dto.type ?? 'manual', dto.notes);
  }
}
