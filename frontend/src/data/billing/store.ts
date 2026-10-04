import { BILLING_SEED } from './seed'
import type {
  Agreement,
  Bill,
  BillingPolicy,
  PriceItem,
  ServiceReport,
} from './types'

/** 计费结算独立持久化：与通用台账的 entries 存储分开，互不污染。 */
const STORAGE_KEY = 'airport-ground-ops:billing'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface BillingState {
  agreements: Agreement[]
  prices: PriceItem[]
  reports: ServiceReport[]
  bills: Bill[]
  policy: BillingPolicy
  seq: Record<string, number>
}

function readStorage(): BillingState {
  const fallback = clone(BILLING_SEED)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<BillingState>) }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: BillingState | null = null

export function billingState(): BillingState {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function persistBilling(next: BillingState): void {
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function mutateBilling(mutator: (draft: BillingState) => void): BillingState {
  const draft = clone(billingState())
  mutator(draft)
  persistBilling(draft)
  return draft
}

export function nextId(kind: keyof BillingState['seq']): number {
  let value = 0
  mutateBilling((draft) => {
    draft.seq[kind] = (draft.seq[kind] ?? 0) + 1
    value = draft.seq[kind]
  })
  return value
}

export function resetBilling(): BillingState {
  const fresh = clone(BILLING_SEED)
  persistBilling(fresh)
  return fresh
}
