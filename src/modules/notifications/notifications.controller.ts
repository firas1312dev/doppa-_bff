import {
  Controller,
  Get,
  Put,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getMyNotifications(@Query('unread') unreadOnly?: string) {
    return this.notificationsService.getMyNotifications(unreadOnly === 'true');
  }

  @Get('unread-count')
  getUnreadCount() {
    return this.notificationsService.getUnreadCount();
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.markAsRead(id);
  }

  @Put('read-all')
  @HttpCode(HttpStatus.OK)
  markAllAsRead() {
    return this.notificationsService.markAllAsRead();
  }
}
