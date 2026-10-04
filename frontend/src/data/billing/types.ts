/** 地面保障计费结算领域模型：协议、价目、口径、班组上报、账单各自独立于通用台账。 */

/** 账单状态只能沿 草稿 → 提交审核 → 确认账单 → 归档 依次流转。 */
export type BillStatus = '草稿' | '提交审核' | '确认账单' | '归档'

export const BILL_FLOW: BillStatus[] = ['草稿', '提交审核', '确认账单', '归档']

/** 航司地面保障服务协议：账单只能在协议有效期内出具。 */
export interface Agreement {
  id: number
  code: string
  airline: string
  airlineCode: string
  startDate: string
  endDate: string
  contact: string
}

/** 服务单价目录：逐项挂基础单价；档次类服务再乘机位档次系数，跨天类按保障天数计。 */
export interface PriceItem {
  id: number
  serviceCode: string
  serviceName: string
  unit: string
  basePrice: number
  pricingMode: 'fixed' | 'tier'
  usesCrossDay: boolean
}

/** 跨天保障计天口径：自然日（含首尾）或每满 24 小时计一天。 */
export type CrossDayMode = 'calendar' | '24h'

export interface StandTier {
  tier: string
  coefficient: number
}

/** 结算口径全局只有一份，改版本后所有账单（含已确认、归档）都按新口径实时重算。 */
export interface BillingPolicy {
  version: number
  updatedAt: string
  standTiers: StandTier[]
  crossDayMode: CrossDayMode
}

/** 班组服务上报：加油、廊桥、配餐等散在各班组本子上的原始记录。 */
export interface ServiceReport {
  id: number
  reportNo: string
  flightNo: string
  airlineCode: string
  serviceDate: string
  serviceCode: string
  serviceName: string
  quantity: number
  unit: string
  standTier?: string
  startAt?: string
  endAt?: string
  team: string
  reportedAt: string
  consumed: boolean
  billId?: number
  /** 去重时指向被保留的那条上报 id。 */
  duplicateOf?: number
}

/** 账单明细行：同航班同服务项同日期的重复上报只保留一条，班组合并记录在 teams。 */
export interface BillLine {
  reportId: number
  reportNo: string
  serviceCode: string
  serviceName: string
  billedQty: number
  unit: string
  teams: string[]
  sourceCount: number
  standTier?: string
  startAt?: string
  endAt?: string
  days?: number
}

export interface Bill {
  id: number
  billNo: string
  flightNo: string
  airlineCode: string
  agreementId: number
  serviceDate: string
  standNo: string
  status: BillStatus
  createdAt: string
  submittedAt?: string
  confirmedAt?: string
  archivedAt?: string
  rejectReason?: string
  lines: BillLine[]
  /** 出账时的口径版本，仅作展示；金额永远按当前口径实时算。 */
  policyVersion: number
}

/** 账单明细的实时计价结果（不落库，口径一改这里立刻变）。 */
export interface BillLineView extends BillLine {
  basePrice: number
  coefficient: number
  amount: number
  priceMissing: boolean
  tierMissing: boolean
}

export interface BillView extends Bill {
  airline: string
  agreementCode: string
  totalAmount: number
  missingCount: number
  lineViews: BillLineView[]
  policyStale: boolean
  agreementActive: boolean
}

/** 生成账单前的航班候选（未归集上报按航班+日期聚合）。 */
export interface FlightCandidate {
  flightNo: string
  serviceDate: string
  airlineCode: string
  airline: string
  reportCount: number
  duplicateCount: number
  estimatedAmount: number
  agreement: Agreement | undefined
  agreementActive: boolean
}
