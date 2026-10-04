<template>
  <div>
    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">账单总数</span>
        <strong class="stat-value">{{ bills.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待归集航班</span>
        <strong class="stat-value">{{ candidates.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">应收合计（已确认+归档）</span>
        <strong class="stat-value">¥{{ confirmedTotal.toFixed(2) }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">口径版本</span>
        <strong class="stat-value">v{{ policy.version }}</strong>
      </article>
    </div>

    <h3 class="block-title">待出账航班（未归集的班组上报）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>航班号</th><th>服务日期</th><th>航司</th><th>协议状态</th>
          <th>上报条数</th><th>重复上报</th><th>预估金额(元)</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in candidates" :key="c.flightNo + c.serviceDate">
          <td>{{ c.flightNo }}</td>
          <td>{{ c.serviceDate }}</td>
          <td>{{ c.airline }}</td>
          <td :class="c.agreementActive ? 'ok' : 'bad'">
            {{ c.agreement ? `${c.agreement.code}（${c.agreementActive ? '有效期内' : `${c.agreement.endDate} 已到期`}）` : '无协议' }}
          </td>
          <td>{{ c.reportCount }}</td>
          <td :class="c.duplicateCount ? 'warn' : ''">{{ c.duplicateCount ? `${c.duplicateCount} 条` : '—' }}</td>
          <td>¥{{ c.estimatedAmount.toFixed(2) }}</td>
          <td>
            <button class="link" type="button" @click="generate(c.flightNo, c.serviceDate)">归集生成账单</button>
          </td>
        </tr>
        <tr v-if="!candidates.length">
          <td colspan="8" class="empty-state">没有待归集的班组上报</td>
        </tr>
      </tbody>
    </table>

    <h3 class="block-title">
      账单列表
      <button class="btn package" type="button" @click="packageOpen = !packageOpen">
        {{ packageOpen ? '收起打包' : '按航司打包对账文件' }}
      </button>
    </h3>

    <div v-if="packageOpen" class="package-bar">
      <span>选择航司：</span>
      <button
        v-for="a in agreements"
        :key="a.id"
        class="btn"
        type="button"
        @click="packageAirline(a.airlineCode)"
      >{{ a.airline }}（{{ a.airlineCode }}）</button>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>航班号</span>
        <input v-model="filterFlight" placeholder="按航班号检索" />
      </label>
      <label class="filter-item">
        <span>航司</span>
        <select v-model="filterAirline">
          <option value="">全部</option>
          <option v-for="a in agreements" :key="a.id" :value="a.airlineCode">{{ a.airline }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>状态</span>
        <select v-model="filterStatus">
          <option value="">全部</option>
          <option v-for="s in flow" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>结算单号</th><th>航班号</th><th>航司</th><th>服务日期</th><th>服务项</th>
          <th>应收金额(元)</th><th>口径</th><th>状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="bill in filtered" :key="bill.id">
          <td>{{ bill.billNo }}</td>
          <td>{{ bill.flightNo }}</td>
          <td>{{ bill.airline }}</td>
          <td>{{ bill.serviceDate }}</td>
          <td>
            {{ bill.lines.length }} 项
            <span v-if="bill.missingCount" class="bad">（{{ bill.missingCount }} 项缺价）</span>
          </td>
          <td>¥{{ bill.totalAmount.toFixed(2) }}</td>
          <td>
            v{{ bill.policyVersion }}
            <span v-if="bill.policyStale" class="stale" title="口径已变更，金额已按最新口径实时重算">已重算</span>
          </td>
          <td>
            {{ bill.status }}
            <span v-if="bill.rejectReason" class="bad" :title="bill.rejectReason">（已退回）</span>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(bill)">明细/流转</button>
          </td>
        </tr>
        <tr v-if="!filtered.length">
          <td colspan="9" class="empty-state">暂无账单</td>
        </tr>
      </tbody>
    </table>

    <BillDetailModal :bill="activeBill" @close="activeBill = null" @action="onDetailAction" />
    <p v-if="message" class="page-foot">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { billingState } from '@/data/billing/store'
import {
  createBill,
  deleteBill,
  exportAirlinePackage,
  exportBill,
  flightCandidates,
  listBillViews,
  reCollectBill,
  transitionBill,
} from '@/data/billing/engine'
import { downloadTextFile } from '@/data/billing/download'
import { BILL_FLOW } from '@/data/billing/types'
import type { BillView } from '@/data/billing/types'
import BillDetailModal from './BillDetailModal.vue'

const flow = BILL_FLOW
const bills = ref<BillView[]>([])
const candidates = ref(flightCandidates())
const agreements = ref(billingState().agreements)
const policy = ref(billingState().policy)
const packageOpen = ref(false)
const activeBill = ref<BillView | null>(null)
const message = ref('')

const filterFlight = ref('')
const filterAirline = ref('')
const filterStatus = ref('')

const filtered = computed(() =>
  bills.value.filter(
    (bill) =>
      (!filterFlight.value || bill.flightNo.includes(filterFlight.value.trim())) &&
      (!filterAirline.value || bill.airlineCode === filterAirline.value) &&
      (!filterStatus.value || bill.status === filterStatus.value),
  ),
)

const confirmedTotal = computed(() =>
  bills.value
    .filter((bill) => bill.status === '确认账单' || bill.status === '归档')
    .reduce((sum, bill) => sum + bill.totalAmount, 0),
)

function reload() {
  bills.value = listBillViews()
  candidates.value = flightCandidates()
  agreements.value = billingState().agreements
  policy.value = billingState().policy
}

function generate(flightNo: string, serviceDate: string) {
  message.value = ''
  const result = createBill(flightNo, serviceDate)
  message.value = result.message
  if (result.ok) reload()
}

function openDetail(bill: BillView) {
  message.value = ''
  activeBill.value = bill
}

function onDetailAction(action: string, bill: BillView) {
  message.value = ''
  if (action === '重新归集') {
    const result = reCollectBill(bill.id)
    message.value = result.message
  } else if (action === '删除') {
    if (!window.confirm(`确定删除草稿账单 ${bill.billNo} ？`)) return
    const result = deleteBill(bill.id)
    message.value = result.message
    if (result.ok) activeBill.value = null
  } else if (action === '审核退回') {
    const reason = window.prompt('请填写退回原因（可留空用默认话术）', '')
    const result = transitionBill(bill.id, '审核退回', reason ?? '')
    message.value = result.message
  } else if (action === '导出结算单') {
    const result = exportBill(bill.id)
    if (result.ok && result.data) downloadTextFile(result.data.filename, result.data.content)
    message.value = result.message
    if (result.ok) {
      activeBill.value = null
      reload()
    }
    return
  } else {
    const map = { 提交审核: '提交审核', 审核确认: '审核确认', 归档: '归档' } as const
    const key = map[action as keyof typeof map]
    if (key) {
      const result = transitionBill(bill.id, key)
      message.value = result.message
    }
  }
  reload()
  if (activeBill.value) activeBill.value = listBillViews().find((item) => item.id === bill.id) ?? null
}

function packageAirline(airlineCode: string) {
  message.value = ''
  const result = exportAirlinePackage(airlineCode)
  if (result.ok && result.data) {
    downloadTextFile(result.data.filename, result.data.content)
  }
  message.value = result.message
}

reload()
</script>

<style scoped>
.block-title { display: flex; justify-content: space-between; align-items: center; font-size: 14px; margin: 16px 0 8px; }
.block-title .package { font-size: 12px; padding: 4px 10px; }
.package-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; border: 1px dashed var(--border); border-radius: 8px; padding: 10px; margin-bottom: 10px; font-size: 13px; }
.ok { color: #067647; }
.bad { color: #b42318; }
.warn { color: #b54708; font-weight: 600; }
.stale { margin-left: 4px; font-size: 11px; color: #b54708; background: #fffaeb; border-radius: 4px; padding: 1px 5px; }
</style>
