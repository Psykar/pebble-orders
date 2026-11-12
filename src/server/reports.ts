import {reddit, settings} from '@devvit/web/server'
import type {T3} from '@devvit/web/shared'
import type {ReportsRsp} from '../shared/api.ts'
import {
  type Entry,
  isLikelyReport,
  normalizeEntry,
  type ReportStatus,
} from '../shared/parser.js'

/** Must match the `settings.subreddit` key in devvit.json. */
export const megaThreadSetting = 'megaThread'
/** Used until a moderator sets megaThread; keep in step with devvit.json. */
export const defaultThreadId: T3 = 't3_1sjk3c7'

/**
 * Parses a mega thread reference into a post ID. Accepts a post ID with or
 * without the t3_ prefix, a reddit.com comments URL or a redd.it short link.
 */
export function parseThreadId(input: string): T3 | undefined {
  const value = input.trim()
  const id =
    value.match(/^(?:t3_)?([a-z0-9]{3,12})$/i)?.[1] ??
    value.match(
      /^(?:https?:\/\/)?(?:[a-z]+\.)?reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)/i,
    )?.[1] ??
    value.match(/^(?:https?:\/\/)?redd\.it\/([a-z0-9]+)/i)?.[1]
  return id ? `t3_${id.toLowerCase()}` : undefined
}

/** The configured mega thread, falling back to the default if unset or bad. */
export async function getThreadId(): Promise<T3> {
  const value = await settings.get<string>(megaThreadSetting)
  return (value && parseThreadId(value)) || defaultThreadId
}

/** The subset of a Devvit Comment the parser needs. */
export type ThreadComment = {
  id: string
  authorName: string
  body: string
  createdAt: Date
  parentId: string
  permalink: string
  score: number
}

export type ThreadPost = {
  id: T3
  permalink: string
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
// One getComments pass can silently miss top-level comments: when expanding a
// "load more" stub, @devvit/reddit 0.15.3 discards any nested "more" IDs that
// Reddit returns. Passes in different orders miss different comments, so
// merge two.
const commentSorts = ['new', 'old'] as const

export async function fetchReports(threadId: T3): Promise<ReportsRsp> {
  const post = await reddit.getPostById(threadId)
  const passes = await Promise.all(
    commentSorts.map(sort =>
      reddit
        .getComments({
          postId: threadId,
          depth: 1,
          limit: 10_000,
          pageSize: 100,
          sort,
        })
        .all(),
    ),
  )
  const comments = new Map<string, ThreadComment>()
  for (const pass of passes) for (const c of pass) comments.set(c.id, c)
  const counts = commentSorts.map((sort, i) => `${sort} ${passes[i]?.length}`)
  console.log(
    `${threadId} comments: ${counts.join(', ')}, merged ${comments.size}`,
  )
  return buildReports(post, [...comments.values()])
}

export function buildReports(
  post: Readonly<ThreadPost>,
  comments: readonly Readonly<ThreadComment>[],
): ReportsRsp {
  const parsed: Entry[] = []
  for (const comment of comments) {
    if (comment.parentId !== post.id) continue
    // Deleted accounts all share the name [deleted], which would merge their
    // reports when deduping by author.
    if (!comment.authorName || comment.authorName === '[deleted]') continue
    if (!comment.body) continue
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
    threadId: post.id,
    post: {
      title: post.title,
      created: post.createdAt.toISOString(),
      score: post.score,
      numComments: post.numberOfComments,
    },
    entries: dedupeByAuthorAndDevice(parsed),
    source: absolutePermalink(post.permalink),
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
