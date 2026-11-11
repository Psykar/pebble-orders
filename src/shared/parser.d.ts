/** Types for parser.js, ported as-is from pebble-dash. */

export type ReportStatus =
  | 'Delivered'
  | 'Shipped'
  | 'Confirmed'
  | 'Waiting'
  | 'Unknown'

/** A raw comment before parsing. Known fields are prefilled as 'Unknown'. */
export type EntryInput = {
  author: string
  body: string
  created: string | null
  score: number
  permalink: string | null
  device?: string
  color?: string
  country?: string
  batch?: string
  status?: string
  orderDate?: string | null
  confirmDate?: string | null
  shippingDate?: string | null
  arrivalDate?: string | null
}

export type Entry = EntryInput & {
  device: string
  color: string
  country: string
  continent: string
  batch: string
  orderDate: string | null
  confirmDate: string | null
  shippingDate: string | null
  arrivalDate: string | null
  orderDateTime: string | null
  confirmDateTime: string | null
  shippingDateTime: string | null
  arrivalDateTime: string | null
  tax: string | null
  taxAmount: number | null
  taxCurrency: string | null
  taxDisplay: string | null
  status: ReportStatus
}

export function normalizeEntry(entry: EntryInput): Entry
export function isLikelyReport(entry: Entry): boolean
