import type { PreparedQuery } from '../exec.js';

export interface FilterRow {
  FilterType: 'tier' | 'status';
  Value: string;
}

export function buildFiltersQuery(): PreparedQuery {
  return {
    sql: `SELECT 'tier' AS FilterType, Tier AS Value
FROM CiresonAnalytics.dbo.SM_WorkItem_Incident WHERE Tier IS NOT NULL
UNION
SELECT 'tier', Tier FROM CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest WHERE Tier IS NOT NULL
UNION
SELECT 'status', Status FROM CiresonAnalytics.dbo.SM_WorkItem_Incident WHERE Status IS NOT NULL
UNION
SELECT 'status', Status FROM CiresonAnalytics.dbo.SM_WorkItem_ServiceRequest WHERE Status IS NOT NULL
ORDER BY Value;`,
    inputs: {},
  };
}
