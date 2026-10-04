<template>
  <div v-if="bill" class="modal-mask" @click.self="$emit('close')">
    <div class="modal wide">
      <header class="modal-head">
        <h3>{{ bill.billNo }} · {{ bill.flightNo }}</h3>
        <button class="link" type="button" @click="$emit('close')">关闭</button>
      </header>

      <div class="detail-meta">
        <span>航司：{{ bill.airline }}</span>
        <span>协议：{{ bill.agreementCode }}
          <em :class="bill.agreementActive ? 'ok' : 'bad'">
            {{ bill.agreementActive ? '有效期内' : '已过期' }}
          </em>
        </span>
        <span>服务日期：{{ bill.serviceDate }}</span>
        <span>状态：{{ bill.status }}</span>
        <span>出账口径：v{{ bill.policyVersion }}</span>
        <span v-if="bill.policyStale" class="stale">⚠ 口径已更新，金额已按最新口径重算</span>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>服务项</th><th>数量</th><th>单位</th><th>机位档次</th><th>系数</th>
            <th>基础单价</th><th>计天</th><th>来源班组</th><th>上报条数</th><th>金额(元)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in bill.lineViews" :key="line.reportId">
            <td>{{ line.serviceName }}</td>
            <td>{{ line.billedQty }}</td>
            <td>{{ line.unit }}</td>
            <td :class="{ bad: line.tierMissing }">
              {{ line.standTier ?? '—' }}<span v-if="line.tierMissing">（口径无此档次）</span>
            </td>
            <td>{{ line.coefficient }}</td>
            <td :class="{ bad: line.priceMissing }">
              {{ line.priceMissing ? '缺单价' : line.basePrice }}
            </td>
            <td>{{ line.days ?? '—' }}</td>
            <td>
              {{ line.teams.join(' / ') }}
              <span v-if="line.sourceCount > 1" class="dedup">去重{{ line.sourceCount - 1 }}条</span>
            </td>
            <td>{{ line.sourceCount }}</td>
            <td>{{ line.amount.toFixed(2) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="9" class="total-label">合计金额（实时按当前口径计算）</td>
            <td class="total-amount">¥{{ bill.totalAmount.toFixed(2) }}</td>
          </tr>
        </tfoot>
      </table>

      <p v-if="bill.rejectReason" class="error-text">退回原因：{{ bill.rejectReason }}</p>
      <p v-if="bill.missingCount" class="error-text">有 {{ bill.missingCount }} 个服务项缺单价或档次系数，需补全价目/口径。</p>

      <footer class="modal-foot">
        <button v-if="bill.status === '草稿'" class="btn" type="button" @click="act('重新归集')">重新归集上报</button>
        <button v-if="bill.status === '草稿'" class="btn danger" type="button" @click="act('删除')">删除草稿</button>
        <button v-if="bill.status === '草稿'" class="btn primary" type="button" @click="act('提交审核')">提交审核</button>
        <template v-if="bill.status === '提交审核'">
          <button class="btn danger" type="button" @click="act('审核退回')">审核退回</button>
          <button class="btn primary" type="button" @click="act('审核确认')">审核确认</button>
        </template>
        <button v-if="bill.status === '确认账单'" class="btn primary" type="button" @click="act('归档')">归档</button>
        <button
          v-if="bill.status === '确认账单' || bill.status === '归档'"
          class="btn primary"
          type="button"
          @click="act('导出结算单')"
        >导出结算单</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BillView } from '@/data/billing/types'

const props = defineProps<{ bill: BillView | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', action: string, bill: BillView): void
}>()

function act(action: string) {
  if (props.bill) emit('action', action, props.bill)
}
</script>

<style scoped>
.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: #fff; border-radius: 10px; width: 720px; max-height: 86vh; overflow: auto; padding: 16px 18px; }
.modal.wide { width: 980px; }
.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.modal-head h3 { margin: 0; font-size: 16px; }
.detail-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.detail-meta .ok { color: #067647; font-style: normal; }
.detail-meta .bad, .bad { color: #b42318; }
.stale { color: #b54708; background: #fffaeb; border-radius: 4px; padding: 1px 6px; }
.dedup { margin-left: 6px; color: #b54708; font-size: 11px; }
.total-label { text-align: right; font-weight: 600; }
.total-amount { font-weight: 700; color: #b42318; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.btn.danger { border-color: #fda29b; color: #b42318; }
</style>
