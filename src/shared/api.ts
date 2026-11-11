import type {Entry} from './parser.js'

/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

/** Parsed shipping reports from the mega thread. */
export type ReportsRsp = {
  post: {title: string; created: string; score: number; numComments: number}
  entries: Entry[]
  source: string
  generatedAt: string
}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  GetReports: 'api/reports',
  OnAppInstall: 'internal/on/app/install',
  OnMenuNewPost: 'internal/on/menu/new-post',
  OnMenuRefresh: 'internal/on/menu/refresh',
  OnRefreshTask: 'internal/scheduler/refresh-reports',
} as const

export const EndpointMethod = {
  [Endpoint.GetReports]: 'GET',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
  [Endpoint.OnMenuRefresh]: 'POST',
  [Endpoint.OnRefreshTask]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
