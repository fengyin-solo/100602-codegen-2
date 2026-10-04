import { billingState, mutateBilling, nextId } from './store'
import { nowStamp, round2 } from './engine'
import type { Agreement, BillingPolicy, CrossDayMode, PriceItem, ServiceReport } from './types'

export interface ActionResult<T = void> {
  ok: boolean
  message: string
  data?: T
}

// ---------- 协议 ----------

export function saveAgreement(input: Omit<Agreement, 'id'> & { id?: number }): ActionResult<Agreement> {
  if (!input.airline.trim() || !input.airlineCode.trim()) {
    return { ok: false, message: '航司名称与二字码必填' }
  }
  if (input.endDate < input.startDate) {
    return { ok: false, message: '协议结束日期不能早于开始日期' }
  }
  const state = billingState()
  const dup = state.agreements.find(
    (item) => item.airlineCode === input.airlineCode && item.id !== input.id,
  )
  if (dup) {
    return { ok: false, message: `航司 ${input.airlineCode} 已存在协议 ${dup.code}` }
  }
  let saved: Agreement | undefined
  mutateBilling((draft) => {
    if (input.id) {
      const target = draft.agreements.find((item) => item.id === input.id)
      if (target) Object.assign(target, input, { id: target.id })
      saved = target
    } else {
      const agreement: Agreement = { ...input, id: nextId('agreements') }
      draft.agreements.push(agreement)
      saved = agreement
    }
  })
  return { ok: true, message: '协议已保存', data: saved }
}

// ---------- 价目 ----------

export function savePrice(input: Omit<PriceItem, 'id'> & { id?: number }): ActionResult<PriceItem> {
  if (!input.serviceCode.trim() || !input.serviceName.trim()) {
    return { ok: false, message: '服务项编码与名称必填' }
  }
  if (Number(input.basePrice) < 0) {
    return { ok: false, message: '单价不能为负' }
  }
  const state = billingState()
  const dup = state.prices.find((item) => item.serviceCode === input.serviceCode && item.id !== input.id)
  if (dup) return { ok: false, message: `服务项 ${input.serviceCode} 已存在` }
  let saved: PriceItem | undefined
  mutateBilling((draft) => {
    const normalized = { ...input, basePrice: round2(Number(input.basePrice)) }
    if (input.id) {
      const target = draft.prices.find((item) => item.id === input.id)
      if (target) Object.assign(target, normalized, { id: target.id })
      saved = target
    } else {
      const price: PriceItem = { ...normalized, id: nextId('prices') }
      draft.prices.push(price)
      saved = price
    }
  })
  return { ok: true, message: '单价已保存，所有账单将按新价目实时重算', data: saved }
}

// ---------- 班组上报 ----------

export function saveReport(
  input: Omit<ServiceReport, 'id' | 'consumed' | 'reportNo' | 'reportedAt' | 'serviceName' | 'unit'> & {
    id?: number
    reportNo?: string
    reportedAt?: string
  },
): ActionResult<ServiceReport> {
  if (!input.flightNo.trim() || !input.serviceDate || !input.serviceCode) {
    return { ok: false, message: '航班号、服务日期、服务项必填' }
  }
  if (Number(input.quantity) <= 0) {
    return { ok: false, message: '数量必须大于 0' }
  }
  const price = billingState().prices.find((item) => item.serviceCode === input.serviceCode)
  if (!price) return { ok: false, message: '服务项在单价目录里不存在，请先维护价目' }
  if (price.usesCrossDay && (!input.startAt || !input.endAt)) {
    return { ok: false, message: '该服务跨天计天，必须填开始和结束时间' }
  }
  let saved: ServiceReport | undefined
  mutateBilling((draft) => {
    const payload = {
      ...input,
      serviceName: price.serviceName,
      unit: price.unit,
      quantity: Number(input.quantity),
    }
    if (input.id) {
      const target = draft.reports.find((item) => item.id === input.id)
      if (target) {
        if (target.consumed) return
        Object.assign(target, payload, { id: target.id })
      }
      saved = target
    } else {
      const id = nextId('reports')
      const report: ServiceReport = {
        ...payload,
        id,
        reportNo: input.reportNo ?? `RPT-${input.serviceDate.split('-').join('')}-${String(id).padStart(3, '0')}`,
        reportedAt: input.reportedAt ?? nowStamp(),
        consumed: false,
      }
      draft.reports.push(report)
      saved = report
    }
  })
  if (!saved) return { ok: false, message: '上报已归集进账单，不能直接修改，请在账单上重新归集' }
  return { ok: true, message: '班组上报已登记', data: saved }
}

export function deleteReport(id: number): ActionResult {
  const report = billingState().reports.find((item) => item.id === id)
  if (!report) return { ok: false, message: '上报不存在' }
  if (report.consumed) return { ok: false, message: '上报已归集，不能删除；请先处理关联账单' }
  mutateBilling((draft) => {
    draft.reports = draft.reports.filter((item) => item.id !== id)
  })
  return { ok: true, message: '上报已删除' }
}

// ---------- 结算口径（全局唯一） ----------

export interface PolicyInput {
  standTiers: { tier: string; coefficient: number }[]
  crossDayMode: CrossDayMode
}

/** 保存口径即升版本；金额实时重算，所以历史账单不用逐条改，展示上会提示口径已更新。 */
export function savePolicy(input: PolicyInput): ActionResult<{ affected: number }> {
  if (input.standTiers.some((item) => !item.tier.trim() || Number(item.coefficient) <= 0)) {
    return { ok: false, message: '每个档次都要填名称和大于 0 的系数' }
  }
  const affected = billingState().bills.length
  mutateBilling((draft) => {
    draft.policy = {
      version: draft.policy.version + 1,
      updatedAt: nowStamp(),
      standTiers: input.standTiers.map((item) => ({ tier: item.tier.trim(), coefficient: Number(item.coefficient) })),
      crossDayMode: input.crossDayMode,
    } satisfies BillingPolicy
  })
  return { ok: true, message: `口径已升至 v${billingState().policy.version}，${affected} 张账单全部按新口径重算`, data: { affected } }
}

/** 口径改动后需要财务重点复核的账单：金额相对出账时口径发生变化。 */
export function staleBills(): { billNo: string; oldVersion: number }[] {
  const state = billingState()
  return state.bills
    .filter((bill) => bill.policyVersion !== state.policy.version && bill.status !== '草稿')
    .map((bill) => ({ billNo: bill.billNo, oldVersion: bill.policyVersion }))
}
