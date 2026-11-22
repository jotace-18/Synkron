import {
  Body,
  Controller,
  Header,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto';
import type { NotificationView } from '../notifications/notification.types';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationServiceGuard } from './automation-service.guard';

@Controller('internal/automation/notifications')
@UseGuards(AutomationServiceGuard)
export class AutomationNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(
    @Body() body: CreateNotificationDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<NotificationView> {
    const result = await this.notifications.create(body);

    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);

    return result.notification;
  }
}
