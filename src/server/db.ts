import {redis} from '@devvit/web/server'
import type {ReportsRsp} from '../shared/api.ts'

const reportsKey = 'reports:v1'

export async function dbGetReports(): Promise<ReportsRsp | undefined> {
  const json = await redis.get(reportsKey)
  return json ? (JSON.parse(json) as ReportsRsp) : undefined
}

export async function dbSetReports(
  reports: Readonly<ReportsRsp>,
): Promise<void> {
  await redis.set(reportsKey, JSON.stringify(reports))
}
