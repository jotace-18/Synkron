import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { isRecord } from '../events/event-validation';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import type { NotificationView } from './notification.types';
import { NotificationsService } from './notifications.service';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListNotificationsDto,
  ): Promise<NotificationView[]> {
    return this.notifications.list(request.tenantId, query);
  }

  @Get('unread-count')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  countUnread(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ unread: number }> {
    return this.notifications.countUnread(request.tenantId);
  }

  @Patch(':id/read')
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
    @Body() body: unknown,
  ): Promise<NotificationView> {
    if (!isRecord(body) || Object.keys(body).length !== 0) {
      throw new UnprocessableEntityException(
        'El cuerpo debe ser un objeto vacío',
      );
    }

    return this.notifications.markRead(request.tenantId, id);
  }
}
