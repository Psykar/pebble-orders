import {redis} from '@devvit/web/server'
import type {ReportsRsp} from '../shared/api.ts'

const reportsKey = 'reports:v1'
// Devvit Rules require deleted comments to leave storage. Each refresh
// (~15 min) rebuilds from the live thread; the expiry bounds how long deleted
// content survives if refreshes stop.
const reportsTtlMs = 60 * 60 * 1000

export async function dbGetReports(): Promise<ReportsRsp | undefined> {
  const json = await redis.get(reportsKey)
  return json ? (JSON.parse(json) as ReportsRsp) : undefined
}

export async function dbSetReports(
  reports: Readonly<ReportsRsp>,
): Promise<void> {
  await redis.set(reportsKey, JSON.stringify(reports), {
    expiration: new Date(Date.now() + reportsTtlMs),
  })
}
