import type { EventsService, StoreEventResult } from '../events/events.service';
import { parseSyncEvent } from '../events/parse-sync-event';

export type ProcessMonitoringEventResult = StoreEventResult | 'invalid';

export async function processMonitoringEvent(
  content: Buffer,
  events: EventsService,
): Promise<ProcessMonitoringEventResult> {
  let value: unknown;

  try {
    value = JSON.parse(content.toString('utf8'));
  } catch {
    return 'invalid';
  }

  const event = parseSyncEvent(value);

  if (!event) {
    return 'invalid';
  }

  return events.store(event);
}
