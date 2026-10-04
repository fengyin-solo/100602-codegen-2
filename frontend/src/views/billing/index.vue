<template>
  <section class="page" data-module="billing">
    <header class="page-head">
      <div>
        <h2>地面保障计费结算</h2>
        <p class="page-desc">按航班归集各班组上报的服务项，逐项挂单价与数量出结算单，按航班或航司打包导出对账文件。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportFile('flight')">导出对账文件（按航班）</button>
        <button class="btn" type="button" @click="exportFile('airline')">导出对账文件（按航司）</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <section class="panel">
      <h3>计费口径（全平台唯一一份，当前 {{ rules.版本 }}，{{ rules.生效日期 }} 起生效）</h3>
      <form class="filter-bar" @submit.prevent="saveRules">
        <label v-for="tier in tiers" :key="tier" class="filter-item">
          <span>{{ tier }}折算系数</span>
          <input v-model="ruleForm[tier]" type="number" step="0.01" min="0" />
        </label>
        <label class="filter-item">
          <span>跨天保障计费</span>
          <select v-model="ruleForm.跨天计费">
            <option value="按自然日">按自然日（跨几天算几天）</option>
            <option value="按24小时">按24小时（满24小时算一天）</option>
          </select>
        </label>
        <button class="btn primary" type="submit">保存口径并重算</button>
      </form>
      <p class="hint">保存后所有未归档账单立即按新口径重算，已归档账单封存不动；机位档次折算与跨天计费都以这一份为准。</p>
    </section>

    <section class="panel">
      <h3>生成结算单</h3>
      <form class="filter-bar" @submit.prevent="createBill">
        <label class="filter-item">
          <span>航班号</span>
          <input v-model="newFlightNo" placeholder="按航班归集服务项，如 CA1832" />
        </label>
        <button class="btn primary" type="submit">归集并出账（草稿）</button>
      </form>
      <p class="hint">只归集协议有效期内的航司：协议过期一律不许出账；同一服务项被多个班组重复上报时自动去重，只计一条金额。</p>
    </section>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无结算单，可先在上方按航班归集出账</td>
        </tr>
      </tbody>
    </table>

    <section class="panel">
      <h3>服务项上报（去重后只保留一条计入金额）</h3>
      <form class="filter-bar" @submit.prevent="reloadReports">
        <label class="filter-item">
          <span>航班号</span>
          <input v-model="reportFilter" placeholder="按航班号检索服务项" />
        </label>
        <button class="btn" type="submit">查询</button>
      </form>
      <table class="data-table">
        <thead>
          <tr>
            <th>航班号</th><th>服务项</th><th>上报班组</th><th>计费方式</th><th>数量</th>
            <th>单价</th><th>机位档次</th><th>保障开始</th><th>保障结束</th><th>去重结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in reportRows" :key="item.report.id">
            <td>{{ item.report.航班号 }}</td>
            <td>{{ item.report.服务项 }}</td>
            <td>{{ item.report.上报班组 }}</td>
            <td>{{ item.report.计费方式 }}</td>
            <td>{{ item.report.数量 }}</td>
            <td>{{ item.report.单价 }}</td>
            <td>{{ item.report.机位档次 || '—' }}</td>
            <td>{{ item.report.保障开始 }}</td>
            <td>{{ item.report.保障结束 }}</td>
            <td :class="item.计入 ? 'ok-text' : 'error-text'">{{ item.计入 ? '计入' : '重复上报，已剔除' }}</td>
          </tr>
          <tr v-if="!reportRows.length">
            <td colspan="10" class="empty-state">暂无服务项上报</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h3>航司服务协议（账单只能在有效期内出具）</h3>
      <table class="data-table">
        <thead>
          <tr><th>航司代码</th><th>航司名称</th><th>协议编号</th><th>有效期起</th><th>有效期止</th><th>今日状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in agreements" :key="item.协议编号">
            <td>{{ item.航司代码 }}</td>
            <td>{{ item.航司名称 }}</td>
            <td>{{ item.协议编号 }}</td>
            <td>{{ item.有效期起 }}</td>
            <td>{{ item.有效期止 }}</td>
            <td :class="agreementState(item) === '有效' ? 'ok-text' : 'error-text'">{{ agreementState(item) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 张结算单</span>
      <span v-if="infoMessage" class="ok-text">{{ infoMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  agreementOn,
  currentRules,
  dedupeReports,
  downloadReconciliation,
  generateBill,
  listAgreements,
  listReports,
  updateBillingRules,
} from '@/api/billing-service'
import {
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { AirlineAgreement, BillingRules } from '@/data/billing'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('billing')
const columns = meta.fields
const actions = meta.actions
const statuses = meta.statuses

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const infoMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const newFlightNo = ref('')
const reportFilter = ref('')
const agreements = ref<AirlineAgreement[]>([])
const rules = ref<BillingRules>(currentRules())
const ruleForm = ref<Record<string, string>>({ 跨天计费: rules.value.跨天计费 })
const reportRows = ref<{ report: ReturnType<typeof listReports>[number]; 计入: boolean }[]>([])

const tiers = computed(() => Object.keys(rules.value.机位档次系数))

const stats = computed(() => [
  { label: '结算单总数', value: total.value },
  { label: '应收总金额', value: `¥${rows.value.reduce((sum, row) => sum + Number(row['应收金额'] ?? 0), 0).toLocaleString()}` },
  { label: '提交审核中', value: rows.value.filter((row) => row.status === '提交审核').length },
  { label: '已归档', value: rows.value.filter((row) => row.status === '已归档').length },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function agreementState(item: AirlineAgreement) {
  return agreementOn(item, new Date().toISOString().slice(0, 10))
}

function resetFilters() {
  filters.value = {}
  reload()
}

function createBill() {
  errorMessage.value = ''
  infoMessage.value = ''
  const result = generateBill(newFlightNo.value)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
  newFlightNo.value = ''
  reload()
}

function saveRules() {
  errorMessage.value = ''
  infoMessage.value = ''
  const 机位档次系数: Record<string, number> = {}
  for (const tier of tiers.value) {
    机位档次系数[tier] = Number(ruleForm.value[tier])
  }
  const result = updateBillingRules({
    机位档次系数,
    跨天计费: ruleForm.value['跨天计费'] === '按24小时' ? '按24小时' : '按自然日',
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
  reload()
}

function exportFile(scope: 'flight' | 'airline') {
  errorMessage.value = ''
  infoMessage.value = ''
  const result = downloadReconciliation(scope)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  infoMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
  reload()
}

function reloadReports() {
  reportRows.value = dedupeReports(listReports(reportFilter.value))
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    agreements.value = listAgreements()
    rules.value = currentRules()
    ruleForm.value = { ...rules.value.机位档次系数, 跨天计费: rules.value.跨天计费 } as Record<string, string>
    reloadReports()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '计费结算列表读取失败'
  }
}

onMounted(reload)
</script>
