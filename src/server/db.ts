import {redis} from '@devvit/web/server'
import type {ReportsRsp} from '../shared/api.ts'
import type {KnownComment} from './reports.ts'

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

function knownCommentsKey(threadId: string): string {
  return `known-comments:v1:${threadId}`
}

export async function dbGetKnownComments(
  threadId: string,
): Promise<KnownComment[]> {
  const json = await redis.get(knownCommentsKey(threadId))
  return json ? (JSON.parse(json) as KnownComment[]) : []
}

/** Shares the reports expiry so deleted content can't outlive it. */
export async function dbSetKnownComments(
  threadId: string,
  comments: readonly KnownComment[],
): Promise<void> {
  await redis.set(knownCommentsKey(threadId), JSON.stringify(comments), {
    expiration: new Date(Date.now() + reportsTtlMs),
  })
}
