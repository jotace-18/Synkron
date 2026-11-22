import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import type { CreateNotificationInput } from '../src/notifications/notification.types';

describe('Notification identity and ownership (PostgreSQL)', () => {
  const database = new DatabaseService();
  const notifications = new NotificationsService(database);
  const tenantId = randomUUID();
  const otherTenant = randomUUID();

  beforeAll(() => database.checkConnection());
  afterAll(async () => {
    try {
      await database.query(
        'DELETE FROM monitoring.notifications WHERE tenant_id IN ($1, $2)',
        [tenantId, otherTenant],
      );
    } finally {
      await database.onModuleDestroy();
    }
  });

  it('deduplicates concurrent deliveries, preserves first read and isolates accounts', async () => {
    const actionId = randomUUID();
    const input: CreateNotificationInput = {
      tenant_id: tenantId,
      source_action_id: actionId,
      message: 'Aviso de integración',
      source: {
        kind: 'reminder',
        reminder_id: actionId,
        activity_id: randomUUID(),
        deadline_key: 'date:2030-01-02',
      },
    };
    const delivered = await Promise.all(
      Array.from({ length: 3 }, () => notifications.create(input)),
    );
    expect(delivered.filter((result) => result.created)).toHaveLength(1);
    const id = delivered[0].notification.id;
    expect(
      new Set(delivered.map((result) => result.notification.id)).size,
    ).toBe(1);
    await expect(notifications.countUnread(tenantId)).resolves.toEqual({
      unread: 1,
    });
    await expect(notifications.countUnread(otherTenant)).resolves.toEqual({
      unread: 0,
    });
    await expect(
      notifications.markRead(otherTenant, id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      notifications.list(otherTenant, { limit: 20, offset: 0 }),
    ).resolves.toEqual([]);

    const firstRead = await notifications.markRead(tenantId, id);
    expect(firstRead.read_at).not.toBeNull();
    await expect(notifications.markRead(tenantId, id)).resolves.toEqual(
      firstRead,
    );
    await expect(notifications.create(input)).resolves.toEqual({
      created: false,
      notification: firstRead,
    });
    await expect(notifications.countUnread(tenantId)).resolves.toEqual({
      unread: 0,
    });
    await expect(
      notifications.create({ ...input, message: 'Contenido distinto' }),
    ).rejects.toBeInstanceOf(ConflictException);

    const separate = await notifications.create({
      ...input,
      tenant_id: otherTenant,
    });
    expect(separate.created).toBe(true);
    expect(separate.notification.id).not.toBe(id);
  });
});
