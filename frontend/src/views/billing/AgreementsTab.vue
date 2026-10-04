<template>
  <div>
    <h3 class="block-title">
      航司服务协议
      <button class="btn primary" type="button" @click="openAgreement()">新增协议</button>
    </h3>
    <table class="data-table">
      <thead>
        <tr><th>协议编号</th><th>航司</th><th>代码</th><th>有效期</th><th>当前状态</th><th>联系人</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in state.agreements" :key="a.id">
          <td>{{ a.code }}</td>
          <td>{{ a.airline }}</td>
          <td>{{ a.airlineCode }}</td>
          <td>{{ a.startDate }} ~ {{ a.endDate }}</td>
          <td :class="isActive(a) ? 'ok' : 'bad'">{{ isActive(a) ? '有效期内' : '已过期（禁止出账）' }}</td>
          <td>{{ a.contact }}</td>
          <td><button class="link" type="button" @click="openAgreement(a)">编辑</button></td>
        </tr>
      </tbody>
    </table>

    <h3 class="block-title">
      服务单价目录
      <button class="btn primary" type="button" @click="openPrice()">新增服务单价</button>
    </h3>
    <p class="page-desc">档次类服务金额 = 基础单价 × 数量 × 机位档次系数；跨天类（如地面电源）按天计，天数由「结算口径」统一折算。改价后所有账单实时重算。</p>
    <table class="data-table">
      <thead>
        <tr><th>编码</th><th>服务项</th><th>单位</th><th>基础单价(元)</th><th>计价方式</th><th>跨天计天</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in state.prices" :key="p.id">
          <td>{{ p.serviceCode }}</td>
          <td>{{ p.serviceName }}</td>
          <td>{{ p.unit }}</td>
          <td>{{ p.basePrice }}</td>
          <td>{{ p.pricingMode === 'tier' ? '按机位档次折算' : '固定单价' }}</td>
          <td>{{ p.usesCrossDay ? '是' : '否' }}</td>
          <td><button class="link" type="button" @click="openPrice(p)">编辑</button></td>
        </tr>
      </tbody>
    </table>

    <!-- 协议弹窗 -->
    <div v-if="agreementOpen" class="modal-mask" @click.self="agreementOpen = false">
      <form class="modal form-grid" @submit.prevent="submitAgreement">
        <header class="modal-head"><h3>{{ agreementForm.id ? '编辑协议' : '新增协议' }}</h3></header>
        <label><span>协议编号</span><input v-model="agreementForm.code" required /></label>
        <label><span>航司名称</span><input v-model="agreementForm.airline" required /></label>
        <label><span>航司二字码</span><input v-model="agreementForm.airlineCode" required maxlength="2" /></label>
        <label><span>生效日期</span><input v-model="agreementForm.startDate" type="date" required /></label>
        <label><span>失效日期</span><input v-model="agreementForm.endDate" type="date" required /></label>
        <label><span>联系人</span><input v-model="agreementForm.contact" /></label>
        <p v-if="agreementError" class="error-text form-msg">{{ agreementError }}</p>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="agreementOpen = false">取消</button>
          <button class="btn primary" type="submit">保存</button>
        </footer>
      </form>
    </div>

    <!-- 价目弹窗 -->
    <div v-if="priceOpen" class="modal-mask" @click.self="priceOpen = false">
      <form class="modal form-grid" @submit.prevent="submitPrice">
        <header class="modal-head"><h3>{{ priceForm.id ? '编辑单价' : '新增服务单价' }}</h3></header>
        <label><span>服务项编码</span><input v-model="priceForm.serviceCode" required :disabled="!!priceForm.id" /></label>
        <label><span>服务项名称</span><input v-model="priceForm.serviceName" required /></label>
        <label><span>计量单位</span><input v-model="priceForm.unit" required placeholder="次 / 吨 / 份 / 天" /></label>
        <label><span>基础单价(元)</span><input v-model.number="priceForm.basePrice" type="number" step="0.01" min="0" required /></label>
        <label>
          <span>计价方式</span>
          <select v-model="priceForm.pricingMode">
            <option value="fixed">固定单价</option>
            <option value="tier">按机位档次折算</option>
          </select>
        </label>
        <label class="check-line">
          <input v-model="priceForm.usesCrossDay" type="checkbox" />
          <span>跨天服务，按保障天数计（天数取统一口径）</span>
        </label>
        <p v-if="priceError" class="error-text form-msg">{{ priceError }}</p>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="priceOpen = false">取消</button>
          <button class="btn primary" type="submit">保存</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { billingState } from '@/data/billing/store'
import { saveAgreement, savePrice } from '@/data/billing/admin'
import { agreementActive } from '@/data/billing/engine'
import type { Agreement, PriceItem } from '@/data/billing/types'

const state = ref(billingState())
const isActive = (a: Agreement) => agreementActive(a)

const agreementOpen = ref(false)
const agreementError = ref('')
const agreementForm = reactive<Omit<Agreement, 'id'> & { id?: number }>({
  id: undefined, code: '', airline: '', airlineCode: '', startDate: '', endDate: '', contact: '',
})

function openAgreement(agreement?: Agreement) {
  agreementError.value = ''
  Object.assign(agreementForm, agreement ?? {
    id: undefined, code: `AGR-${new Date().getFullYear()}-`, airline: '', airlineCode: '',
    startDate: '', endDate: '', contact: '',
  })
  agreementOpen.value = true
}

function submitAgreement() {
  const result = saveAgreement({
    ...agreementForm,
    code: agreementForm.code.trim(),
    airline: agreementForm.airline.trim(),
    airlineCode: agreementForm.airlineCode.trim().toUpperCase(),
  })
  if (!result.ok) { agreementError.value = result.message; return }
  agreementOpen.value = false
  state.value = billingState()
}

const priceOpen = ref(false)
const priceError = ref('')
const priceForm = reactive<Omit<PriceItem, 'id'> & { id?: number }>({
  id: undefined, serviceCode: '', serviceName: '', unit: '', basePrice: 0,
  pricingMode: 'fixed', usesCrossDay: false,
})

function openPrice(price?: PriceItem) {
  priceError.value = ''
  Object.assign(priceForm, price ?? {
    id: undefined, serviceCode: '', serviceName: '', unit: '', basePrice: 0,
    pricingMode: 'fixed', usesCrossDay: false,
  })
  priceOpen.value = true
}

function submitPrice() {
  const result = savePrice({ ...priceForm, serviceCode: priceForm.serviceCode.trim().toUpperCase() })
  if (!result.ok) { priceError.value = result.message; return }
  priceOpen.value = false
  state.value = billingState()
}
</script>

<style scoped>
.block-title { display: flex; justify-content: space-between; align-items: center; font-size: 14px; margin: 16px 0 8px; }
.ok { color: #067647; }
.bad { color: #b42318; }
.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: #fff; border-radius: 10px; }
.modal-head h3 { margin: 0 0 12px; font-size: 16px; }
.form-grid { width: 560px; padding: 16px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.form-grid label { display: flex; flex-direction: column; font-size: 12px; color: var(--muted); gap: 4px; }
.form-grid input, .form-grid select { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }
.form-grid input:disabled { background: #f1f5f9; }
.check-line { flex-direction: row !important; align-items: center; grid-column: 1 / -1; }
.form-msg { grid-column: 1 / -1; margin: 0; }
.modal-foot { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
</style>
