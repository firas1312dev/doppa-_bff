import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveUser, ActiveUserData } from '../../common/decorators/active-user.decorator';
import { ClassSchedulesService } from './class-schedules.service';

@Controller({ path: 'class-schedules', version: '1' })
@UseGuards(JwtAuthGuard)
export class ClassSchedulesController {
  constructor(private readonly classSchedulesService: ClassSchedulesService) {}

  @Get()
  getUpcomingSchedules(@Query('limit') limit?: string) {
    return this.classSchedulesService.getUpcomingSchedules(limit ? parseInt(limit, 10) : 50);
  }

  @Get(':id/info')
  getScheduleInfo(@Param('id', ParseIntPipe) id: number) {
    return this.classSchedulesService.getScheduleInfo(id);
  }

  @Get(':id/status')
  getScheduleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.classSchedulesService.getScheduleStatus(id);
  }

  @Post(':id/book')
  @HttpCode(HttpStatus.CREATED)
  bookClass(
    @Param('id', ParseIntPipe) id: number,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.classSchedulesService.bookClass(id, user.sub);
  }
}
