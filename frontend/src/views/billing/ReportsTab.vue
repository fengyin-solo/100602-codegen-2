<template>
  <div>
    <div class="page-head">
      <p class="page-desc">各班组手工上报的服务原始记录：同航班同服务项被多个班组重复上报时，账单归集会自动去重，只计一次金额。</p>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记班组上报</button>
      </div>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>航班号</span>
        <input v-model="kwFlight" placeholder="按航班号检索" />
      </label>
      <label class="filter-item">
        <span>班组</span>
        <input v-model="kwTeam" placeholder="按班组检索" />
      </label>
      <label class="filter-item">
        <span>状态</span>
        <select v-model="kwConsumed">
          <option value="">全部</option>
          <option value="open">未归集</option>
          <option value="consumed">已归集</option>
        </select>
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>上报单号</th><th>航班号</th><th>航司</th><th>服务日期</th><th>服务项</th>
          <th>数量</th><th>机位档次</th><th>起止时间</th><th>班组</th><th>状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in filtered" :key="r.id" :class="{ dup: r.duplicateOf }">
          <td>{{ r.reportNo }}</td>
          <td>{{ r.flightNo }}</td>
          <td>{{ r.airlineCode }}</td>
          <td>{{ r.serviceDate }}</td>
          <td>{{ r.serviceName }}</td>
          <td>{{ r.quantity }} {{ r.unit }}</td>
          <td>{{ r.standTier ?? '—' }}</td>
          <td>{{ r.startAt && r.endAt ? `${r.startAt} ~ ${r.endAt}` : '—' }}</td>
          <td>{{ r.team }}</td>
          <td>
            <span v-if="r.duplicateOf" class="warn">重复已去重→RPT#{{ r.duplicateOf }}</span>
            <span v-else-if="r.consumed">已归集账单 #{{ r.billId }}</span>
            <em v-else class="ok">待归集</em>
          </td>
          <td>
            <button v-if="!r.consumed" class="link" type="button" @click="openEdit(r)">编辑</button>
            <button v-if="!r.consumed" class="link danger" type="button" @click="remove(r)">删除</button>
          </td>
        </tr>
        <tr v-if="!filtered.length">
          <td colspan="11" class="empty-state">没有匹配的班组上报</td>
        </tr>
      </tbody>
    </table>

    <div v-if="formOpen" class="modal-mask" @click.self="formOpen = false">
      <form class="modal form-grid" @submit.prevent="submit">
        <header class="modal-head"><h3>{{ form.id ? '编辑上报' : '登记班组上报' }}</h3></header>
        <label><span>航班号</span><input v-model="form.flightNo" required placeholder="如 MU5101" /></label>
        <label>
          <span>航司</span>
          <select v-model="form.airlineCode" required>
            <option value="">请选择</option>
            <option v-for="a in state.agreements" :key="a.id" :value="a.airlineCode">{{ a.airline }}（{{ a.airlineCode }}）</option>
          </select>
        </label>
        <label><span>服务日期</span><input v-model="form.serviceDate" type="date" required /></label>
        <label>
          <span>服务项</span>
          <select v-model="form.serviceCode" required>
            <option value="">请选择</option>
            <option v-for="p in state.prices" :key="p.id" :value="p.serviceCode">
              {{ p.serviceName }}（{{ p.basePrice }}元/{{ p.unit }}{{ p.pricingMode === 'tier' ? '·档次' : '' }}{{ p.usesCrossDay ? '·跨天' : '' }}）
            </option>
          </select>
        </label>
        <label>
          <span>数量<span v-if="selectedPrice?.usesCrossDay" class="hint">（跨天按天计，数量忽略）</span></span>
          <input v-model.number="form.quantity" type="number" step="0.01" min="0" required :disabled="selectedPrice?.usesCrossDay" />
        </label>
        <label>
          <span>机位档次</span>
          <select v-model="form.standTier">
            <option value="">不适用</option>
            <option v-for="t in state.policy.standTiers" :key="t.tier" :value="t.tier">{{ t.tier }}（×{{ t.coefficient }}）</option>
          </select>
        </label>
        <label v-if="selectedPrice?.usesCrossDay"><span>开始时间</span><input v-model="form.startAt" placeholder="2026-10-03 22:00" /></label>
        <label v-if="selectedPrice?.usesCrossDay"><span>结束时间</span><input v-model="form.endAt" placeholder="2026-10-04 02:00" /></label>
        <label><span>上报班组</span><input v-model="form.team" required placeholder="如 加油班" /></label>
        <p v-if="error" class="error-text form-msg">{{ error }}</p>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="formOpen = false">取消</button>
          <button class="btn primary" type="submit">保存</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { billingState } from '@/data/billing/store'
import { deleteReport, saveReport } from '@/data/billing/admin'
import type { ServiceReport } from '@/data/billing/types'

const state = ref(billingState())
const kwFlight = ref('')
const kwTeam = ref('')
const kwConsumed = ref('')
const formOpen = ref(false)
const error = ref('')
const form = reactive({
  id: undefined as number | undefined,
  flightNo: '',
  airlineCode: '',
  serviceDate: '',
  serviceCode: '',
  quantity: 1,
  unit: '',
  standTier: '',
  startAt: '',
  endAt: '',
  team: '',
})

const reports = computed(() => [...state.value.reports].sort((a, b) => b.id - a.id))
const filtered = computed(() =>
  reports.value.filter(
    (r) =>
      (!kwFlight.value || r.flightNo.includes(kwFlight.value.trim())) &&
      (!kwTeam.value || r.team.includes(kwTeam.value.trim())) &&
      (kwConsumed.value === '' || (kwConsumed.value === 'consumed' ? r.consumed : !r.consumed)),
  ),
)
const selectedPrice = computed(() => state.value.prices.find((p) => p.serviceCode === form.serviceCode))

function resetForm() {
  Object.assign(form, {
    id: undefined, flightNo: '', airlineCode: '', serviceDate: '', serviceCode: '',
    quantity: 1, unit: '', standTier: '', startAt: '', endAt: '', team: '',
  })
}

function openCreate() {
  error.value = ''
  resetForm()
  formOpen.value = true
}

function openEdit(report: ServiceReport) {
  error.value = ''
  Object.assign(form, {
    id: report.id, flightNo: report.flightNo, airlineCode: report.airlineCode,
    serviceDate: report.serviceDate, serviceCode: report.serviceCode, quantity: report.quantity,
    unit: report.unit, standTier: report.standTier ?? '', startAt: report.startAt ?? '',
    endAt: report.endAt ?? '', team: report.team,
  })
  formOpen.value = true
}

function submit() {
  const result = saveReport({
    id: form.id,
    flightNo: form.flightNo.trim(),
    airlineCode: form.airlineCode,
    serviceDate: form.serviceDate,
    serviceCode: form.serviceCode,
    quantity: form.quantity,
    standTier: selectedPrice.value?.pricingMode === 'tier' ? form.standTier || undefined : undefined,
    startAt: form.startAt || undefined,
    endAt: form.endAt || undefined,
    team: form.team.trim(),
  })
  if (!result.ok) {
    error.value = result.message
    return
  }
  formOpen.value = false
  state.value = billingState()
}

function remove(report: ServiceReport) {
  if (!window.confirm(`删除上报 ${report.reportNo}？`)) return
  const result = deleteReport(report.id)
  if (!result.ok) window.alert(result.message)
  state.value = billingState()
}
</script>

<style scoped>
.ok { color: #067647; font-style: normal; }
.warn { color: #b54708; }
tr.dup { background: #fffaeb; }
.link.danger { color: #b42318; margin-left: 8px; }
.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: #fff; border-radius: 10px; }
.modal-head h3 { margin: 0 0 12px; font-size: 16px; }
.form-grid { width: 560px; padding: 16px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.form-grid label { display: flex; flex-direction: column; font-size: 12px; color: var(--muted); gap: 4px; }
.form-grid input, .form-grid select { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }
.form-grid input:disabled { background: #f1f5f9; color: var(--muted); }
.hint { color: var(--muted); font-weight: 400; }
.form-msg { grid-column: 1 / -1; margin: 0; }
.modal-foot { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
</style>
