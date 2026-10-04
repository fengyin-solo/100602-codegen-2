import { loadBilling, saveBilling } from '@/data/billing'
import type { AirlineAgreement, BillLine, BillingRules, ServiceReport } from '@/data/billing'
import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 地面保障计费结算的业务规则全部收在这里，页面组件不做业务判断。

export const BILLING_KEY = 'billing'
/** 账单状态机：只能按这个顺序一步一步走，跳步在 local-service 里挡回。 */
export const BILLING_FLOW = ['草稿', '提交审核', '确认账单', '已归档']

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function listReports(flightNo = ''): ServiceReport[] {
  const reports = loadBilling().reports
  const keyword = flightNo.trim()
  return keyword ? reports.filter((item) => item.航班号.includes(keyword)) : reports
}

export function listAgreements(): AirlineAgreement[] {
  return loadBilling().agreements
}

export function currentRules(): BillingRules {
  return loadBilling().rules
}

export function billLinesOf(billId: number): BillLine[] {
  return loadBilling().billLines[String(billId)] ?? []
}

export function agreementOn(agreement: AirlineAgreement, date: string): '有效' | '已过期' {
  return agreement.有效期起 <= date && date <= agreement.有效期止 ? '有效' : '已过期'
}

/** 跨天保障按几天计：口径只有一份，自然日跨几天算几天，或满 24 小时算一天。 */
export function serviceDays(report: ServiceReport, rules: BillingRules): number {
  if (report.计费方式 !== '按天') {
    return 0
  }
  const start = new Date(report.保障开始.replace(' ', 'T'))
  const end = new Date(report.保障结束.replace(' ', 'T'))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 1
  }
  if (rules.跨天计费 === '按24小时') {
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
  }
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
  return Math.floor((endDay - startDay) / 86400000) + 1
}

/** 同一航班同一服务项被多个班组重复上报时去重：保留最早上报的一条，其余剔除不计金额。 */
export function dedupeReports(reports: ServiceReport[]): { report: ServiceReport; 计入: boolean }[] {
  const seen = new Set<string>()
  return [...reports]
    .sort((a, b) => a.id - b.id)
    .map((report) => {
      const key = `${report.航班号}|${report.服务项}`
      const 计入 = !seen.has(key)
      seen.add(key)
      return { report, 计入 }
    })
}

function buildLine(report: ServiceReport, 计入: boolean, rules: BillingRules): BillLine {
  const 计费天数 = serviceDays(report, rules)
  const 档次系数 = report.机位档次 ? (rules.机位档次系数[report.机位档次] ?? 1) : 1
  const base = report.计费方式 === '按天' ? 计费天数 : report.数量
  const 金额 = 计入 ? round2(report.单价 * base * 档次系数) : 0
  return {
    上报ID: report.id,
    服务项: report.服务项,
    上报班组: report.上报班组,
    计费方式: report.计费方式,
    单价: report.单价,
    数量: report.数量,
    计费天数,
    档次系数,
    金额,
    计入,
  }
}

function summarize(lines: BillLine[]) {
  const counted = lines.filter((line) => line.计入)
  return {
    服务项数: counted.length,
    去重剔除: lines.length - counted.length,
    计费天数: counted.reduce((sum, line) => sum + line.计费天数, 0),
    应收金额: round2(counted.reduce((sum, line) => sum + line.金额, 0)),
  }
}

/** 给新账单挂资源计划：取保障时段不晚于今天、最近的一张未作废计划，审核结论要回写到它上面。 */
function pickResourcePlan(): string {
  const date = today()
  const plans = listRows('resplan').filter((row) => row.status !== '已作废')
  const sorted = [...plans].sort((a, b) => String(b['保障时段']).localeCompare(String(a['保障时段'])))
  const hit = sorted.find((row) => String(row['保障时段']) <= date) ?? sorted[0]
  return hit ? String(hit['计划编号']) : ''
}

/** 按航班归集服务项生成结算单（草稿）。协议过期一律不许出账。 */
export function generateBill(flightNo: string): ActionResult {
  const keyword = flightNo.trim()
  if (!keyword) {
    return { ok: false, message: '先填航班号再生成结算单' }
  }
  const reports = listReports(keyword)
  if (reports.length === 0) {
    return { ok: false, message: `航班 ${keyword} 没有可归集的服务项上报` }
  }
  const airline = reports[0].航司代码
  const agreement = loadBilling().agreements.find((item) => item.航司代码 === airline)
  if (!agreement) {
    return { ok: false, message: `航司 ${airline} 没有登记服务协议，不许出账` }
  }
  const date = today()
  if (agreementOn(agreement, date) !== '有效') {
    return {
      ok: false,
      message: `航司服务协议 ${agreement.协议编号} 已于 ${agreement.有效期止} 到期，协议过期不许出账`,
    }
  }
  const rows = listRows(BILLING_KEY)
  const existing = rows.find((row) => row['航班号'] === keyword && row.status !== '已归档')
  if (existing) {
    return { ok: false, message: `航班 ${keyword} 已有结算单 ${existing['结算单号']}（${existing.status}），口径调整请走重算` }
  }
  const rules = currentRules()
  const lines = dedupeReports(reports).map(({ report, 计入 }) => buildLine(report, 计入, rules))
  const summary = summarize(lines)
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const bill: EntryRow = {
    id,
    status: BILLING_FLOW[0],
    pending: true,
    abnormal: false,
    结算单号: `SETL-${String(id).padStart(4, '0')}`,
    航班号: keyword,
    航司代码: airline,
    服务项数: summary.服务项数,
    去重剔除: summary.去重剔除,
    计费天数: summary.计费天数,
    应收金额: summary.应收金额,
    口径版本: rules.版本,
    协议有效期: `${agreement.有效期起}~${agreement.有效期止}`,
    关联计划: pickResourcePlan(),
    出账日期: date,
  }
  saveRows(BILLING_KEY, [...rows, bill])
  const store = loadBilling()
  saveBilling({ ...store, billLines: { ...store.billLines, [String(id)]: lines } })
  return {
    ok: true,
    message: `结算单 ${bill['结算单号']} 已生成（草稿）：归集 ${summary.服务项数} 项，去重剔除 ${summary.去重剔除} 条，应收 ¥${summary.应收金额}`,
  }
}

/** 口径变了以后，未归档账单一律按当前口径重算；已归档的封存不动。 */
export function recalculateBills(): number {
  const rules = currentRules()
  const store = loadBilling()
  const rows = listRows(BILLING_KEY)
  let recalculated = 0
  const nextRows = rows.map((row) => {
    if (row.status === BILLING_FLOW[BILLING_FLOW.length - 1]) {
      return row
    }
    const lines = (store.billLines[String(row.id)] ?? []).map((line) => {
      const report = store.reports.find((item) => item.id === line.上报ID)
      return report ? buildLine(report, line.计入, rules) : line
    })
    const summary = summarize(lines)
    store.billLines[String(row.id)] = lines
    recalculated += 1
    return {
      ...row,
      服务项数: summary.服务项数,
      去重剔除: summary.去重剔除,
      计费天数: summary.计费天数,
      应收金额: summary.应收金额,
      口径版本: rules.版本,
    }
  })
  saveRows(BILLING_KEY, nextRows)
  saveBilling({ ...store })
  // 已确认账单的审核结论已经回过资源缺口清单，重算后同步刷新，两边不许是两套数。
  for (const row of nextRows) {
    if (row.status === '确认账单') {
      writeBackResourceGap(row)
    }
  }
  return recalculated
}

/** 保存新口径（全平台只有这一份），并立即重算所有未归档账单。 */
export function updateBillingRules(input: {
  机位档次系数: Record<string, number>
  跨天计费: BillingRules['跨天计费']
}): ActionResult {
  for (const [tier, factor] of Object.entries(input.机位档次系数)) {
    if (!Number.isFinite(factor) || factor < 0) {
      return { ok: false, message: `机位档次「${tier}」的折算系数不是有效数字` }
    }
  }
  const store = loadBilling()
  const versionNumber = Number(store.rules.版本.replace(/^V/, '')) || 1
  const rules: BillingRules = {
    版本: `V${versionNumber + 1}`,
    生效日期: today(),
    机位档次系数: { ...input.机位档次系数 },
    跨天计费: input.跨天计费,
  }
  saveBilling({ ...store, rules })
  const recalculated = recalculateBills()
  return {
    ok: true,
    message: `计费口径已更新为 ${rules.版本}，${recalculated} 张未归档账单已按新口径重算（已归档账单封存不动）`,
  }
}

/** 审核结论回写资源缺口清单：保障资源调度看到的应收费用就是账单上的数。 */
export function writeBackResourceGap(bill: EntryRow): void {
  const note = `应收¥${bill['应收金额']}（${bill['结算单号']}·账单已确认）`
  const rows = listRows('resplan')
  const index = rows.findIndex((row) => row['计划编号'] === bill['关联计划'])
  if (index >= 0) {
    const kept = String(rows[index]['资源缺口'] ?? '')
      .split('；')
      .filter((part) => part.includes('应收¥') && !part.includes(String(bill['结算单号'])))
    const next = [...rows]
    next[index] = { ...rows[index], 资源缺口: [...kept, note].join('；') }
    saveRows('resplan', next)
    return
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const plan: EntryRow = {
    id,
    status: '待编制',
    pending: true,
    abnormal: false,
    计划编号: String(bill['关联计划'] || `RESP-${String(id).padStart(4, '0')}`),
    保障时段: String(bill['出账日期']),
    机位需求: '—',
    车辆需求: '—',
    人员需求: '—',
    资源缺口: note,
    调度人员: '计费结算回写',
    计划状态: '待编制',
  }
  saveRows('resplan', [...rows, plan])
}

/** 把结算单打包成对账文件：按航班或按航司分组，含分组小计与总计。 */
export function exportReconciliation(scope: 'flight' | 'airline'): ActionResult & { filename?: string; content?: string } {
  const rules = currentRules()
  const store = loadBilling()
  const airlineName = (code: string) =>
    store.agreements.find((item) => item.航司代码 === code)?.航司名称 ?? code
  const bills = listRows(BILLING_KEY).filter((row) => row.status !== '草稿')
  if (bills.length === 0) {
    return { ok: false, message: '没有已提交审核的结算单，草稿不出对账文件' }
  }
  const groups = new Map<string, EntryRow[]>()
  for (const bill of bills) {
    const key = scope === 'flight' ? String(bill['航班号']) : `${bill['航司代码']} ${airlineName(String(bill['航司代码']))}`
    groups.set(key, [...(groups.get(key) ?? []), bill])
  }
  const header = ['分组', '结算单号', '航班号', '航司', '服务项', '上报班组', '单价', '数量', '计费天数', '档次系数', '金额', '账单状态']
  const lines = [
    `# 地面保障对账文件（${scope === 'flight' ? '按航班' : '按航司'}）,口径版本:${rules.版本},导出日期:${today()}`,
    header.join(','),
  ]
  let grandTotal = 0
  for (const [key, group] of [...groups.entries()].sort()) {
    let subtotal = 0
    for (const bill of group) {
      const airline = `${bill['航司代码']} ${airlineName(String(bill['航司代码']))}`
      for (const line of billLinesOf(Number(bill.id))) {
        if (!line.计入) {
          continue
        }
        subtotal = round2(subtotal + line.金额)
        lines.push(
          [
            key,
            bill['结算单号'],
            bill['航班号'],
            airline,
            line.服务项,
            line.上报班组,
            line.单价,
            line.数量,
            line.计费天数 || '',
            line.档次系数,
            line.金额,
            bill.status,
          ].join(','),
        )
      }
    }
    grandTotal = round2(grandTotal + subtotal)
    lines.push([`${key} 小计`, '', '', '', '', '', '', '', '', '', subtotal, ''].join(','))
  }
  lines.push(['总计', '', '', '', '', '', '', '', '', '', grandTotal, ''].join(','))
  return {
    ok: true,
    message: `对账文件已生成：${groups.size} 个分组，合计应收 ¥${grandTotal}`,
    filename: `对账文件-${scope === 'flight' ? '按航班' : '按航司'}-${today()}.csv`,
    content: `\uFEFF${lines.join('\n')}`,
  }
}

export function downloadReconciliation(scope: 'flight' | 'airline'): ActionResult {
  const result = exportReconciliation(scope)
  if (!result.ok || !result.filename || !result.content) {
    return { ok: result.ok, message: result.message }
  }
  const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return { ok: true, message: result.message }
}
