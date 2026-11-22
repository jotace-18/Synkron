import type { ActivityType } from '../activities/activity.types';

export const CONNECTOR_CATALOG = {
  'academic.exams': {
    source_collection: 'exams',
    activity_type: 'academic.exam',
    auth_type: 'bearer',
  },
  'academic.assignments': {
    source_collection: 'assignments',
    activity_type: 'academic.assignment',
    auth_type: 'bearer',
  },
} as const satisfies Record<
  string,
  {
    source_collection: string;
    activity_type: ActivityType;
    auth_type: 'none' | 'bearer';
  }
>;

export type ConnectorName = keyof typeof CONNECTOR_CATALOG;

export type ConnectorSourceCollection =
  (typeof CONNECTOR_CATALOG)[ConnectorName]['source_collection'];

export const CONNECTOR_NAMES = Object.freeze(
  Object.keys(CONNECTOR_CATALOG) as ConnectorName[],
);

export function getConnector(name: string) {
  if (!Object.hasOwn(CONNECTOR_CATALOG, name)) {
    return null;
  }

  return CONNECTOR_CATALOG[name as ConnectorName];
}

// Bound as a query parameter: connector and collection must match the same entry.
export const CONNECTOR_SOURCES_JSON = JSON.stringify(
  CONNECTOR_NAMES.map((connector) => ({
    connector,
    source_collection: CONNECTOR_CATALOG[connector].source_collection,
  })),
);

export const DIRECT_INGESTION_CONNECTOR = 'standard.ingestion' as const;
export type RunConnectorName =
  ConnectorName | typeof DIRECT_INGESTION_CONNECTOR;
