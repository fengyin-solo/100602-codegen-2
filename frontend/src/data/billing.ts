// 地面保障计费结算的领域数据：服务项上报、航司服务协议、计费口径与账单明细。
// 与通用清单分开持久化（localStorage 另一个键），结算单列表本身仍走通用数据层。

/** 班组上报的一条服务项：同一航班同一服务项可能被多个班组重复上报，计费前去重。 */
export type ServiceReport = {
  id: number
  航班号: string
  航司代码: string
  服务项: string
  上报班组: string
  计费方式: '按量' | '按天'
  数量: number
  单价: number
  机位档次: string
  保障开始: string
  保障结束: string
  上报时间: string
}

/** 航司服务协议：账单只允许在协议有效期内出具。 */
export type AirlineAgreement = {
  航司代码: string
  航司名称: string
  协议编号: string
  有效期起: string
  有效期止: string
}

/** 计费口径：全平台只有这一份，改了以后未归档账单按新口径重算。 */
export type BillingRules = {
  版本: string
  生效日期: string
  /** 机位档次折算系数：金额 = 单价 × 数量(或天数) × 系数。 */
  机位档次系数: Record<string, number>
  /** 跨天保障计费方式：按自然日（跨几天算几天）或按24小时（满24小时算一天）。 */
  跨天计费: '按自然日' | '按24小时'
}

/** 结算单里的一条计费明细：计入 false 的是重复上报被去重剔除的。 */
export type BillLine = {
  上报ID: number
  服务项: string
  上报班组: string
  计费方式: '按量' | '按天'
  单价: number
  数量: number
  计费天数: number
  档次系数: number
  金额: number
  计入: boolean
}

export type BillingStore = {
  reports: ServiceReport[]
  agreements: AirlineAgreement[]
  rules: BillingRules
  /** key 是结算单在通用数据层里的 id。 */
  billLines: Record<string, BillLine[]>
}

export const BILLING_SEED: BillingStore = {
  reports: [
    { id: 1, 航班号: 'CA1832', 航司代码: 'CA', 服务项: '航油加注', 上报班组: '加油一班', 计费方式: '按量', 数量: 8, 单价: 5450, 机位档次: '', 保障开始: '2026-09-30 21:10', 保障结束: '2026-09-30 21:55', 上报时间: '2026-09-30 22:05' },
    { id: 2, 航班号: 'CA1832', 航司代码: 'CA', 服务项: '廊桥靠接', 上报班组: '廊桥二班', 计费方式: '按量', 数量: 1, 单价: 260, 机位档次: '近机位', 保障开始: '2026-09-30 20:58', 保障结束: '2026-09-30 21:06', 上报时间: '2026-09-30 21:10' },
    // 与 id 2 同一航班同一服务项，另一个班组重复上报，计费时去重只留一条。
    { id: 3, 航班号: 'CA1832', 航司代码: 'CA', 服务项: '廊桥靠接', 上报班组: '廊桥三班', 计费方式: '按量', 数量: 1, 单价: 260, 机位档次: '近机位', 保障开始: '2026-09-30 20:58', 保障结束: '2026-09-30 21:06', 上报时间: '2026-09-30 21:12' },
    { id: 4, 航班号: 'CA1832', 航司代码: 'CA', 服务项: '航空配餐', 上报班组: '配餐一班', 计费方式: '按量', 数量: 180, 单价: 28, 机位档次: '', 保障开始: '2026-09-30 21:20', 保障结束: '2026-09-30 21:50', 上报时间: '2026-09-30 21:55' },
    // 跨天保障：9-30 夜里进场、10-02 凌晨离场，按自然日计 3 天，按24小时计 2 天。
    { id: 5, 航班号: 'CA1832', 航司代码: 'CA', 服务项: '机位停放', 上报班组: '机务一班', 计费方式: '按天', 数量: 1, 单价: 900, 机位档次: '远机位', 保障开始: '2026-09-30 22:40', 保障结束: '2026-10-02 01:15', 上报时间: '2026-10-02 01:30' },
    { id: 6, 航班号: 'CA2077', 航司代码: 'CA', 服务项: '客舱清洁', 上报班组: '清洁二班', 计费方式: '按量', 数量: 1, 单价: 480, 机位档次: '', 保障开始: '2026-10-01 09:10', 保障结束: '2026-10-01 09:50', 上报时间: '2026-10-01 09:55' },
    { id: 7, 航班号: 'CA2077', 航司代码: 'CA', 服务项: '行李装卸', 上报班组: '行李一班', 计费方式: '按量', 数量: 236, 单价: 3.5, 机位档次: '', 保障开始: '2026-10-01 09:00', 保障结束: '2026-10-01 09:45', 上报时间: '2026-10-01 09:50' },
    // MU 的协议已过期：这些服务项归集不出来账单，用来演示“协议过期不许出账”。
    { id: 8, 航班号: 'MU5201', 航司代码: 'MU', 服务项: '航油加注', 上报班组: '加油二班', 计费方式: '按量', 数量: 6, 单价: 5450, 机位档次: '', 保障开始: '2026-10-02 14:05', 保障结束: '2026-10-02 14:40', 上报时间: '2026-10-02 14:45' },
  ],
  agreements: [
    { 航司代码: 'CA', 航司名称: '中国国际航空', 协议编号: 'AGR-CA-2026', 有效期起: '2026-01-01', 有效期止: '2026-12-31' },
    { 航司代码: 'MU', 航司名称: '中国东方航空', 协议编号: 'AGR-MU-2025', 有效期起: '2025-01-01', 有效期止: '2025-12-31' },
    { 航司代码: 'CZ', 航司名称: '中国南方航空', 协议编号: 'AGR-CZ-2026', 有效期起: '2026-03-01', 有效期止: '2027-02-28' },
  ],
  rules: {
    版本: 'V1',
    生效日期: '2026-01-01',
    机位档次系数: { 近机位: 1, 远机位: 0.8, 复合机位: 1.2 },
    跨天计费: '按自然日',
  },
  // 与 data/seed.ts 里 billing 模块的两张示例结算单一一对应。
  billLines: {
    '1': [
      { 上报ID: 1, 服务项: '航油加注', 上报班组: '加油一班', 计费方式: '按量', 单价: 5450, 数量: 8, 计费天数: 0, 档次系数: 1, 金额: 43600, 计入: true },
      { 上报ID: 2, 服务项: '廊桥靠接', 上报班组: '廊桥二班', 计费方式: '按量', 单价: 260, 数量: 1, 计费天数: 0, 档次系数: 1, 金额: 260, 计入: true },
      { 上报ID: 3, 服务项: '廊桥靠接', 上报班组: '廊桥三班', 计费方式: '按量', 单价: 260, 数量: 1, 计费天数: 0, 档次系数: 1, 金额: 0, 计入: false },
      { 上报ID: 4, 服务项: '航空配餐', 上报班组: '配餐一班', 计费方式: '按量', 单价: 28, 数量: 180, 计费天数: 0, 档次系数: 1, 金额: 5040, 计入: true },
      { 上报ID: 5, 服务项: '机位停放', 上报班组: '机务一班', 计费方式: '按天', 单价: 900, 数量: 1, 计费天数: 3, 档次系数: 0.8, 金额: 2160, 计入: true },
    ],
    '2': [
      { 上报ID: 6, 服务项: '客舱清洁', 上报班组: '清洁二班', 计费方式: '按量', 单价: 480, 数量: 1, 计费天数: 0, 档次系数: 1, 金额: 480, 计入: true },
      { 上报ID: 7, 服务项: '行李装卸', 上报班组: '行李一班', 计费方式: '按量', 单价: 3.5, 数量: 236, 计费天数: 0, 档次系数: 1, 金额: 826, 计入: true },
    ],
  },
}

const STORAGE_KEY = 'airport-ground-ops:billing'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let cache: BillingStore | null = null

export function loadBilling(): BillingStore {
  if (cache !== null) {
    return cache
  }
  const fallback = clone(BILLING_SEED)
  if (typeof window === 'undefined' || !window.localStorage) {
    cache = fallback
    return cache
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    cache = fallback
    return cache
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BillingStore>
    cache = {
      reports: parsed.reports ?? fallback.reports,
      agreements: parsed.agreements ?? fallback.agreements,
      rules: parsed.rules ?? fallback.rules,
      billLines: parsed.billLines ?? fallback.billLines,
    }
    return cache
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    cache = fallback
    return cache
  }
}

export function saveBilling(store: BillingStore): void {
  cache = store
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  }
}
