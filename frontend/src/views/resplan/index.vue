<template>
  <section class="page" data-module="resplan">
    <header class="page-head">
      <div>
        <h2>保障资源调度管理</h2>
        <p class="page-desc">维护资源计划与资源缺口。账单审核确认后，审核结论回写到同航班的缺口清单；应收费用实时取自计费结算，两边永远是同一套数。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出保障资源调度清单</button>
        <button class="btn ghost" type="button" @click="resetSeed">恢复示例数据</button>
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
          <th>应收费用(元)</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ written: !!row['审核结论'] }">
          <td v-for="column in columns" :key="column">{{ row[column] || '—' }}</td>
          <td>
            <template v-if="receivable(row)">
              <strong>¥{{ receivable(row)!.amount.toFixed(2) }}</strong>
              <span class="bill-state">（{{ receivable(row)!.status }} {{ receivable(row)!.billNo }}）</span>
            </template>
            <span v-else class="muted">未出账</span>
          </td>
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
          <td :colspan="columns.length + 3" class="empty-state">暂无保障资源调度数据</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条资源计划；应收费用为账单确认后按当前口径实时计算，口径调整这里同步变化</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  resetModule,
  runAction as applyAction,
} from '@/api/local-service'
import { receivableForFlight } from '@/data/billing/engine'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('resplan')
const columns = ["计划编号", "保障时段", "当前航班", "机位需求", "车辆需求", "人员需求", "资源缺口", "调度人员", "关联账单", "审核结论", "审核时间", "计划状态"]
const actions = ["提交审核", "下发计划", "作废计划"]
const statuses = ["待编制", "待审核", "已下发", "已作废"]
const stats = computed(() => [
  { label: "已下发计划", value: rows.value.filter((r) => r.status === '已下发').length },
  { label: "存在缺口的计划", value: rows.value.filter((r) => String(r['资源缺口'] ?? '') !== '暂无缺口').length },
  { label: "已回写审核结论", value: rows.value.filter((r) => r['审核结论']).length },
])

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ["计划编号", "当前航班", "资源缺口"]
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function receivable(row: EntryRow) {
  return receivableForFlight(String(row['当前航班'] ?? ''))
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function resetSeed() {
  if (window.confirm('将恢复保障资源调度的示例数据，当前改动会丢失，确定吗？')) {
    resetModule(meta.key)
    reload()
  }
}function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保障资源调度列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
tr.written { background: #f6fef9; }
.bill-state { color: var(--muted); font-size: 11px; }
.muted { color: var(--muted); }
</style>
