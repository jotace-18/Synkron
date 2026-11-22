import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  CreateNotificationInput,
  NotificationView,
  StoredNotification,
} from './notification.types';

import type { ListNotificationsDto } from './dto/list-notifications.dto';

export interface CreateNotificationResult {
  notification: NotificationView;
  created: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async create(
    input: CreateNotificationInput,
  ): Promise<CreateNotificationResult> {
    const inserted = await this.database.query<StoredNotification>(
      `INSERT INTO monitoring.notifications (
         tenant_id,
         source_action_id,
         message,
         source
       )
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (tenant_id, source_action_id) DO NOTHING
       RETURNING *`,
      [
        input.tenant_id,
        input.source_action_id,
        input.message,
        JSON.stringify(input.source),
      ],
    );

    if (inserted.rows[0]) {
      return {
        notification: this.toView(inserted.rows[0]),
        created: true,
      };
    }

    const existing = await this.database.query<StoredNotification>(
      `SELECT *
       FROM monitoring.notifications
       WHERE tenant_id = $1
         AND source_action_id = $2
         AND message = $3::text
         AND source = $4::jsonb`,
      [
        input.tenant_id,
        input.source_action_id,
        input.message,
        JSON.stringify(input.source),
      ],
    );

    if (!existing.rows[0]) {
      throw new ConflictException(
        'La acción ya se utilizó para un aviso diferente',
      );
    }

    return {
      notification: this.toView(existing.rows[0]),
      created: false,
    };
  }

  async list(
    tenantId: string,
    query: ListNotificationsDto,
  ): Promise<NotificationView[]> {
    const unread =
      query.status === undefined ? null : query.status === 'unread';

    const result = await this.database.query<StoredNotification>(
      `SELECT *
       FROM monitoring.notifications
       WHERE tenant_id = $1
         AND ($2::boolean IS NULL OR (read_at IS NULL) = $2::boolean)
       ORDER BY created_at DESC, id DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, unread, query.limit, query.offset],
    );

    return result.rows.map((notification) => this.toView(notification));
  }

  async countUnread(tenantId: string): Promise<{ unread: number }> {
    const result = await this.database.query<{ unread: number }>(
      `SELECT COUNT(*)::integer AS unread
       FROM monitoring.notifications
       WHERE tenant_id = $1 AND read_at IS NULL`,
      [tenantId],
    );

    return result.rows[0];
  }

  async markRead(
    tenantId: string,
    notificationId: string,
  ): Promise<NotificationView> {
    const result = await this.database.query<StoredNotification>(
      `UPDATE monitoring.notifications
       SET read_at = COALESCE(read_at, clock_timestamp())
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, notificationId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Aviso no encontrado');
    }

    return this.toView(result.rows[0]);
  }

  private toView(notification: StoredNotification): NotificationView {
    return {
      id: notification.id,
      message: notification.message,
      source: notification.source,
      created_at: notification.created_at.toISOString(),
      read_at: notification.read_at?.toISOString() ?? null,
    };
  }
}
