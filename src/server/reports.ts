import {reddit} from '@devvit/web/server'
import type {T3} from '@devvit/web/shared'
import type {ReportsRsp} from '../shared/api.ts'
import {
  type Entry,
  isLikelyReport,
  normalizeEntry,
  type ReportStatus,
} from '../shared/parser.js'

export const threadId: T3 = 't3_1sjk3c7'
export const threadUrl =
  'https://www.reddit.com/r/pebble/comments/1sjk3c7/shipping_mega_thread'

/** The subset of a Devvit Comment the parser needs. */
export type ThreadComment = {
  authorName: string
  body: string
  createdAt: Date
  parentId: string
  permalink: string
  score: number
}

export type ThreadPost = {
  title: string
  createdAt: Date
  score: number
  numberOfComments: number
}

const statusRank: {[status in ReportStatus]: number} = {
  Delivered: 4,
  Shipped: 3,
  Confirmed: 2,
  Waiting: 1,
  Unknown: 0,
}

/** Fetches every top-level comment on the mega thread and parses them. */
export async function fetchReports(): Promise<ReportsRsp> {
  const post = await reddit.getPostById(threadId)
  // getComments expands "load more" stubs itself, so this is the whole thread.
  const comments = await reddit
    .getComments({postId: threadId, depth: 1, limit: 10_000, pageSize: 100})
    .all()
  return buildReports(post, comments)
}

export function buildReports(
  post: Readonly<ThreadPost>,
  comments: readonly Readonly<ThreadComment>[],
): ReportsRsp {
  const parsed: Entry[] = []
  for (const comment of comments) {
    if (comment.parentId !== threadId) continue
    if (!comment.authorName || !comment.body) continue
    if (comment.body === '[deleted]' || comment.body === '[removed]') continue
    const entry = normalizeEntry({
      author: comment.authorName,
      body: comment.body,
      created: comment.createdAt.toISOString(),
      score: comment.score,
      permalink: absolutePermalink(comment.permalink),
      device: 'Unknown',
      color: 'Unknown',
      country: 'Unknown',
      batch: 'Unknown',
      status: 'Unknown',
      orderDate: null,
      confirmDate: null,
      shippingDate: null,
    })
    if (isLikelyReport(entry)) parsed.push(entry)
  }

  return {
    post: {
      title: post.title,
      created: post.createdAt.toISOString(),
      score: post.score,
      numComments: post.numberOfComments,
    },
    entries: dedupeByAuthorAndDevice(parsed),
    source: threadUrl,
    generatedAt: new Date().toISOString(),
  }
}

function absolutePermalink(permalink: string): string {
  return permalink.startsWith('/')
    ? `https://www.reddit.com${permalink}`
    : permalink
}

function compareEntries(a: Readonly<Entry>, b: Readonly<Entry>): number {
  const rankDiff = statusRank[a.status] - statusRank[b.status]
  if (rankDiff !== 0) return rankDiff
  const aTime = a.created ? Date.parse(a.created) : 0
  const bTime = b.created ? Date.parse(b.created) : 0
  if (aTime !== bTime) return aTime - bTime
  return a.score - b.score
}

function bestEntry(entries: readonly Entry[]): Entry | undefined {
  let best: Entry | undefined
  for (const entry of entries)
    if (!best || compareEntries(entry, best) > 0) best = entry
  return best
}

/**
 * One entry per author, keeping their most advanced report. Authors who
 * reported several different devices keep one entry per device.
 */
function dedupeByAuthorAndDevice(entries: readonly Entry[]): Entry[] {
  const byAuthor = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = entry.author.toLowerCase()
    byAuthor.set(key, [...(byAuthor.get(key) ?? []), entry])
  }

  const deduped: Entry[] = []
  for (const authorEntries of byAuthor.values()) {
    const known = authorEntries.filter(entry => entry.device !== 'Unknown')
    const devices = new Set(known.map(entry => entry.device))
    const groups =
      devices.size > 1
        ? [...devices].map(device => known.filter(e => e.device === device))
        : [authorEntries]
    for (const group of groups) {
      const best = bestEntry(group)
      if (best) deduped.push(best)
    }
  }
  return deduped
}
