import { listRows, saveRows } from '@/data/local-store'
import { billingState, mutateBilling } from './store'
import type {
  Agreement,
  Bill,
  BillLine,
  BillLineView,
  BillStatus,
  BillView,
  FlightCandidate,
  ServiceReport,
} from './types'
import { BILL_FLOW } from './types'

export interface ActionResult<T = void> {
  ok: boolean
  message: string
  data?: T
}

export function todayStr(): string {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function nowStamp(): string {
  const now = new Date()
  const time = `${now.getHours()}`.padStart(2, '0')
  const minute = `${now.getMinutes()}`.padStart(2, '0')
  return `${todayStr()} ${time}:${minute}`
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 协议是否在有效期内：出账、提交审核都以当天日期卡。 */
export function agreementActive(agreement: Agreement | undefined, atDate = todayStr()): boolean {
  if (!agreement) return false
  return atDate >= agreement.startDate && atDate <= agreement.endDate
}

export function findAgreement(airlineCode: string): Agreement | undefined {
  return billingState().agreements.find((item) => item.airlineCode === airlineCode)
}

function findPrice(serviceCode: string) {
  return billingState().prices.find((item) => item.serviceCode === serviceCode)
}

/** 机位档次折算系数：档次在口径里查不到时按 1.0 兜底，并在明细上标红提示。 */
export function tierCoefficient(tier: string | undefined): { coefficient: number; missing: boolean } {
  const policy = billingState().policy
  if (!tier) return { coefficient: 1, missing: false }
  const hit = policy.standTiers.find((item) => item.tier === tier)
  return hit ? { coefficient: hit.coefficient, missing: false } : { coefficient: 1, missing: true }
}

function dayIndex(value: string): number {
  const [y, m, d] = value.split('-').map((part) => Number(part))
  return Date.UTC(y, m - 1, d) / 86400000
}

/**
 * 跨天保障计几天，口径全局只有一份：
 * - calendar：按自然日，首尾各算一天（22:00 到次日 02:00 = 2 天）
 * - 24h：每满 24 小时算一天，不足一天按一天（同一例子 = 1 天）
 */
export function crossDayDays(startAt: string | undefined, endAt: string | undefined): number {
  if (!startAt || !endAt) return 1
  const startDay = dayIndex(startAt.slice(0, 10))
  const endDay = dayIndex(endAt.slice(0, 10))
  if (Number.isNaN(startDay) || Number.isNaN(endDay) || endDay < startDay) return 1
  const policy = billingState().policy
  if (policy.crossDayMode === 'calendar') {
    return endDay - startDay + 1
  }
  const startMs = new Date(startAt.replace(' ', 'T')).getTime()
  const endMs = new Date(endAt.replace(' ', 'T')).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return endDay - startDay + 1
  return Math.max(1, Math.ceil((endMs - startMs) / 86400000))
}

interface KeptReport {
  report: ServiceReport
  teams: string[]
  sourceCount: number
  duplicates: ServiceReport[]
}

/**
 * 班组重复上报去重：同航班 + 同服务日期 + 同服务项 + 同机位档次视为一条，
 * 取上报时间最早的一条保留，其余只并入班组与来源条数，金额只计一次。
 */
export function dedupeReports(reports: ServiceReport[]): KeptReport[] {
  const groups = new Map<string, ServiceReport[]>()
  for (const report of reports) {
    const key = [report.flightNo, report.serviceDate, report.serviceCode, report.standTier ?? ''].join('|')
    const list = groups.get(key) ?? []
    list.push(report)
    groups.set(key, list)
  }
  const kept: KeptReport[] = []
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
    const winner = sorted[0]
    const duplicates = sorted.slice(1)
    kept.push({
      report: winner,
      teams: [...new Set(sorted.map((item) => item.team))],
      sourceCount: sorted.length,
      duplicates,
    })
  }
  return kept.sort((a, b) => a.report.reportedAt.localeCompare(b.report.reportedAt))
}

/** 把一批（可能含重复的）上报归集成账单明细行。 */
function linesFromReports(reports: ServiceReport[]): BillLine[] {
  return dedupeReports(reports).map(({ report, teams, sourceCount }) => {
    const price = findPrice(report.serviceCode)
    const crossDay = price?.usesCrossDay === true
    const days = crossDay ? crossDayDays(report.startAt, report.endAt) : undefined
    return {
      reportId: report.id,
      reportNo: report.reportNo,
      serviceCode: report.serviceCode,
      serviceName: report.serviceName,
      billedQty: crossDay ? (days ?? 1) : report.quantity,
      unit: crossDay ? '天' : report.unit,
      teams,
      sourceCount,
      standTier: report.standTier,
      startAt: report.startAt,
      endAt: report.endAt,
      days,
    }
  })
}

/** 明细实时计价：每次都按当前价目与口径算，不落库。 */
export function computeLine(line: BillLine): BillLineView {
  const price = findPrice(line.serviceCode)
  const days = price?.usesCrossDay ? crossDayDays(line.startAt, line.endAt) : undefined
  const liveQty = days ?? line.billedQty
  if (!price) {
    return {
      ...line,
      billedQty: liveQty,
      unit: days !== undefined ? '天' : line.unit,
      days,
      basePrice: 0,
      coefficient: 1,
      amount: 0,
      priceMissing: true,
      tierMissing: false,
    }
  }
  const tier = price.pricingMode === 'tier' ? tierCoefficient(line.standTier) : { coefficient: 1, missing: false }
  return {
    ...line,
    billedQty: price.usesCrossDay ? liveQty : line.billedQty,
    unit: price.usesCrossDay ? '天' : line.unit,
    days,
    basePrice: price.basePrice,
    coefficient: tier.coefficient,
    amount: round2(price.basePrice * liveQty * tier.coefficient),
    priceMissing: false,
    tierMissing: tier.missing,
  }
}

export function viewBill(bill: Bill): BillView {
  const state = billingState()
  const agreement = state.agreements.find((item) => item.id === bill.agreementId)
  const lineViews = bill.lines.map(computeLine)
  const totalAmount = round2(lineViews.reduce((sum, line) => sum + line.amount, 0))
  return {
    ...bill,
    airline: agreement?.airline ?? '未知航司',
    agreementCode: agreement?.code ?? '协议缺失',
    totalAmount,
    missingCount: lineViews.filter((line) => line.priceMissing || line.tierMissing).length,
    lineViews,
    policyStale: bill.policyVersion !== state.policy.version,
    agreementActive: agreementActive(agreement),
  }
}

export function listBillViews(): BillView[] {
  return [...billingState().bills]
    .sort((a, b) => b.id - a.id)
    .map(viewBill)
}

/** 待出账航班：未归集上报按 航班+服务日期 聚合，给生成账单用。 */
export function flightCandidates(): FlightCandidate[] {
  const state = billingState()
  const open = state.reports.filter((report) => !report.consumed)
  const keys = new Map<string, ServiceReport[]>()
  for (const report of open) {
    const key = `${report.flightNo}|${report.serviceDate}`
    const list = keys.get(key) ?? []
    list.push(report)
    keys.set(key, list)
  }
  const result: FlightCandidate[] = []
  for (const list of keys.values()) {
    const first = list[0]
    const agreement = state.agreements.find((item) => item.airlineCode === first.airlineCode)
    const estimated = round2(
      linesFromReports(list).reduce((sum, line) => sum + computeLine(line).amount, 0),
    )
    const duplicateCount = list.length - dedupeReports(list).length
    result.push({
      flightNo: first.flightNo,
      serviceDate: first.serviceDate,
      airlineCode: first.airlineCode,
      airline: agreement?.airline ?? '未知航司',
      reportCount: list.length,
      duplicateCount,
      estimatedAmount: estimated,
      agreement,
      agreementActive: agreementActive(agreement),
    })
  }
  return result.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))
}

/** 生成账单：协议过期一律不出账；同航班上报去重后只挂保留项。 */
export function createBill(flightNo: string, serviceDate: string): ActionResult<Bill> {
  const state = billingState()
  const open = state.reports.filter(
    (report) => !report.consumed && report.flightNo === flightNo && report.serviceDate === serviceDate,
  )
  if (open.length === 0) {
    return { ok: false, message: `航班 ${flightNo} 在 ${serviceDate} 没有可归集的班组上报` }
  }
  const airlineCode = open[0].airlineCode
  const agreement = state.agreements.find((item) => item.airlineCode === airlineCode)
  if (!agreement) {
    return { ok: false, message: `航司 ${airlineCode} 没有服务协议，不能出具账单` }
  }
  if (!agreementActive(agreement)) {
    return { ok: false, message: `协议 ${agreement.code} 已于 ${agreement.endDate} 到期，协议过期不许出账` }
  }
  const duplicate = state.bills.find(
    (bill) => bill.flightNo === flightNo && bill.serviceDate === serviceDate && bill.status !== '归档',
  )
  if (duplicate) {
    return { ok: false, message: `该航班已存在${duplicate.status}账单 ${duplicate.billNo}，不要重复出账` }
  }

  const kept = dedupeReports(open)
  const winnerIds = new Set(kept.map((item) => item.report.id))
  const winnerByDup = new Map<number, number>()
  for (const item of kept) {
    for (const dup of item.duplicates) winnerByDup.set(dup.id, item.report.id)
  }
  const billId = (state.seq.bills ?? state.bills.length) + 1
  const bill: Bill = {
    id: billId,
    billNo: `BILL-${serviceDate.split('-').join('')}-${flightNo}`,
    flightNo,
    airlineCode,
    agreementId: agreement.id,
    serviceDate,
    standNo: open[0].standTier ?? '',
    status: '草稿',
    createdAt: nowStamp(),
    policyVersion: state.policy.version,
    lines: linesFromReports(open),
  }
  mutateBilling((draft) => {
    draft.bills.push(bill)
    draft.seq.bills = billId
    for (const report of draft.reports) {
      if (report.flightNo === flightNo && report.serviceDate === serviceDate && !report.consumed) {
        report.consumed = true
        report.billId = billId
        if (!winnerIds.has(report.id)) report.duplicateOf = winnerByDup.get(report.id)
      }
    }
  })
  return {
    ok: true,
    message: `已生成草稿账单 ${bill.billNo}，归集 ${open.length} 条上报、去重后 ${bill.lines.length} 个服务项`,
    data: bill,
  }
}

function releaseReports(draft: ReturnType<typeof billingState>, bill: Bill): void {
  for (const report of draft.reports) {
    if (report.billId === bill.id) {
      report.consumed = false
      report.billId = undefined
      report.duplicateOf = undefined
    }
  }
}

/** 重新归集：仅草稿/退回状态可做，按最新上报重建明细并重新去重。 */
export function reCollectBill(billId: number): ActionResult {
  const bill = billingState().bills.find((item) => item.id === billId)
  if (!bill) return { ok: false, message: '账单不存在' }
  if (bill.status !== '草稿') {
    return { ok: false, message: `账单处于「${bill.status}」，只有草稿状态能重新归集` }
  }
  const agreement = findAgreement(bill.airlineCode)
  if (!agreementActive(agreement)) {
    return { ok: false, message: '协议已过期，不能重新归集，请先续签协议' }
  }
  let rebuilt: Bill | undefined
  mutateBilling((draft) => {
    const target = draft.bills.find((item) => item.id === billId)
    if (!target) return
    releaseReports(draft, target)
    const open = draft.reports.filter(
      (report) => !report.consumed && report.flightNo === target.flightNo && report.serviceDate === target.serviceDate,
    )
    const kept = dedupeReports(open)
    const winnerIds = new Set(kept.map((item) => item.report.id))
    const winnerByDup = new Map<number, number>()
    for (const item of kept) {
      for (const dup of item.duplicates) winnerByDup.set(dup.id, item.report.id)
    }
    target.lines = linesFromReports(open)
    target.rejectReason = undefined
    for (const report of draft.reports) {
      if (report.flightNo === target.flightNo && report.serviceDate === target.serviceDate && !report.consumed) {
        report.consumed = true
        report.billId = target.id
        if (!winnerIds.has(report.id)) report.duplicateOf = winnerByDup.get(report.id)
      }
    }
    rebuilt = target
  })
  const count = rebuilt?.lines.length ?? 0
  return { ok: true, message: `已重新归集，当前共 ${count} 个服务项` }
}

/** 删除草稿账单并释放已归集上报。 */
export function deleteBill(billId: number): ActionResult {
  const bill = billingState().bills.find((item) => item.id === billId)
  if (!bill) return { ok: false, message: '账单不存在' }
  if (bill.status !== '草稿') return { ok: false, message: '只有草稿账单可以删除' }
  mutateBilling((draft) => {
    const target = draft.bills.find((item) => item.id === billId)
    if (target) releaseReports(draft, target)
    draft.bills = draft.bills.filter((item) => item.id !== billId)
  })
  return { ok: true, message: '草稿账单已删除，上报已释放' }
}

/**
 * 账单状态机：只能 草稿→提交审核→确认账单→归档 依次流转；
 * 审核可退回到草稿。任何跳步一律挡回。
 */
export function transitionBill(
  billId: number,
  action: '提交审核' | '审核确认' | '归档' | '审核退回',
  reason = '',
): ActionResult {
  const state = billingState()
  const bill = state.bills.find((item) => item.id === billId)
  if (!bill) return { ok: false, message: '账单不存在' }

  const forward: Record<string, BillStatus> = {
    提交审核: '提交审核',
    审核确认: '确认账单',
    归档: '归档',
  }
  const fromIndex = BILL_FLOW.indexOf(bill.status)

  if (action === '审核退回') {
    if (bill.status !== '提交审核') {
      return { ok: false, message: `「${bill.status}」状态不能审核退回，流程跳步已挡回` }
    }
    mutateBilling((draft) => {
      const target = draft.bills.find((item) => item.id === billId)
      if (target) {
        target.status = '草稿'
        target.rejectReason = reason || '审核退回：请核对服务项与金额'
      }
    })
    return { ok: true, message: '账单已退回草稿，可修改后重新提交' }
  }

  const wanted = forward[action]
  const wantedIndex = BILL_FLOW.indexOf(wanted)
  if (wantedIndex !== fromIndex + 1) {
    return {
      ok: false,
      message: `账单当前「${bill.status}」，不能直接执行「${action}」，只允许流转到「${BILL_FLOW[fromIndex + 1] ?? '无下一状态'}」，跳步一律挡回`,
    }
  }

  if (action === '提交审核') {
    const agreement = state.agreements.find((item) => item.id === bill.agreementId)
    if (!agreementActive(agreement)) {
      return { ok: false, message: `协议已过期（${agreement?.endDate ?? '无'}），账单不能提交审核` }
    }
    if (bill.lines.length === 0) {
      return { ok: false, message: '账单没有服务项，不能提交审核' }
    }
    const view = viewBill(bill)
    if (view.missingCount > 0) {
      return { ok: false, message: `有 ${view.missingCount} 个服务项缺单价或档次系数，补全价目/口径后再提交` }
    }
  }

  let writeback = ''
  mutateBilling((draft) => {
    const target = draft.bills.find((item) => item.id === billId)
    if (!target) return
    target.status = wanted
    if (wanted === '提交审核') target.submittedAt = nowStamp()
    if (wanted === '确认账单') target.confirmedAt = nowStamp()
    if (wanted === '归档') target.archivedAt = nowStamp()
  })

  if (wanted === '确认账单') {
    writeback = writebackResourcePlan(bill)
  }
  return { ok: true, message: `账单已${action}，当前状态「${wanted}」${writeback}` }
}

/**
 * 审核确认后回写资源缺口清单：审核结论落到保障资源调度的同航班计划上，
 * 应收金额不在这里存一份——资源调度页实时读计费引擎，保证两边永远是同一套数。
 */
function writebackResourcePlan(bill: Bill): string {
  const rows = listRows('resplan')
  const targets = rows.filter((row) => String(row['当前航班'] ?? '') === bill.flightNo)
  if (targets.length === 0) {
    return '（未找到该航班对应的资源计划，缺口清单未回写，请补资源计划）'
  }
  const stamp = nowStamp()
  const next = rows.map((row) =>
    String(row['当前航班'] ?? '') === bill.flightNo
      ? {
          ...row,
          关联账单: bill.billNo,
          审核结论: '已确认应收',
          审核时间: stamp,
        }
      : row,
  )
  saveRows('resplan', next)
  return `，审核结论已回写 ${targets.length} 条资源计划`
}

/** 保障资源调度看到的应收费用：直接按当前口径实时算，账单不另存金额。 */
export function receivableForFlight(flightNo: string): { amount: number; billNo: string; status: BillStatus } | undefined {
  const bill = billingState().bills
    .filter((item) => item.flightNo === flightNo)
    .sort((a, b) => b.id - a.id)[0]
  if (!bill) return undefined
  return { amount: viewBill(bill).totalAmount, billNo: bill.billNo, status: bill.status }
}

function csvCell(value: string | number): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.split('"').join('""')}"` : text
}

function billCsvLines(bill: BillView): (string | number)[][] {
  const lines: (string | number)[][] = [
    ['结算单号', '航司', '协议编号', '航班号', '服务日期', '状态', '口径版本'],
    [bill.billNo, bill.airline, bill.agreementCode, bill.flightNo, bill.serviceDate, bill.status, `v${billingState().policy.version}`],
    [],
    ['服务项', '数量', '单位', '机位档次', '档次系数', '基础单价', '计天', '来源班组', '上报条数', '金额(元)'],
  ]
  for (const line of bill.lineViews) {
    lines.push([
      line.serviceName,
      line.billedQty,
      line.unit,
      line.standTier ?? (findPrice(line.serviceCode)?.pricingMode === 'tier' ? '【缺档次】' : '—'),
      line.coefficient,
      line.priceMissing ? '【缺单价】' : line.basePrice,
      line.days ?? '—',
      line.teams.join('/'),
      line.sourceCount,
      line.amount,
    ])
  }
  lines.push(['合计金额(元)', '', '', '', '', '', '', '', '', bill.totalAmount])
  return lines
}

/** 单航班结算单导出：只有已确认/归档的账单能出对外对账单。 */
export function exportBill(billId: number): ActionResult<{ filename: string; content: string }> {
  const bill = billingState().bills.find((item) => item.id === billId)
  if (!bill) return { ok: false, message: '账单不存在' }
  if (bill.status !== '确认账单' && bill.status !== '归档') {
    return { ok: false, message: `账单处于「${bill.status}」，确认账单后才能导出对账单` }
  }
  const view = viewBill(bill)
  const content = billCsvLines(view).map((row) => row.map(csvCell).join(',')).join('\n')
  return {
    ok: true,
    message: '结算单已导出',
    data: { filename: `${view.billNo}-结算单.csv`, content: `﻿${content}` },
  }
}

/** 按航司把确认/归档账单打包成一份对账文件。 */
export function exportAirlinePackage(
  airlineCode: string,
): ActionResult<{ filename: string; content: string }> {
  const state = billingState()
  const agreement = state.agreements.find((item) => item.airlineCode === airlineCode)
  const bills = state.bills
    .filter((bill) => bill.airlineCode === airlineCode && (bill.status === '确认账单' || bill.status === '归档'))
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
  if (bills.length === 0) {
    return { ok: false, message: '该航司没有已确认或归档的账单，打包不出对账文件' }
  }
  const views = bills.map(viewBill)
  const rows: (string | number)[][] = [
    ['航司对账文件'],
    ['航司', agreement?.airline ?? airlineCode, '航司代码', airlineCode],
    ['协议编号', agreement?.code ?? '—', '协议有效期', `${agreement?.startDate ?? '—'} 至 ${agreement?.endDate ?? '—'}`],
    ['打包日期', todayStr(), '口径版本', `v${state.policy.version}（${state.policy.updatedAt}）`],
    [],
    ['汇总', '结算单号', '航班号', '服务日期', '状态', '金额(元)'],
  ]
  views.forEach((bill, index) => {
    rows.push([`第${index + 1}单`, bill.billNo, bill.flightNo, bill.serviceDate, bill.status, bill.totalAmount])
  })
  rows.push(['合计(元)', '', '', '', '', round2(views.reduce((sum, bill) => sum + bill.totalAmount, 0))])
  for (const bill of views) {
    rows.push([])
    rows.push(...billCsvLines(bill))
  }
  const content = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  return {
    ok: true,
    message: `已打包 ${bills.length} 张账单`,
    data: {
      filename: `航司对账文件-${agreement?.airline ?? airlineCode}-${todayStr()}.csv`,
      content: `﻿${content}`,
    },
  }
}
