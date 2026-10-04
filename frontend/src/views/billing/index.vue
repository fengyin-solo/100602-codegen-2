<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>地面保障计费结算</h2>
        <p class="page-desc">
          按航班归集加油、廊桥、配餐等班组服务，逐项挂单价数量；口径全局唯一，改后历史账单实时重算；
          账单严格沿 草稿 → 提交审核 → 确认账单 → 归档 流转，审核确认回写资源缺口清单。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn ghost" type="button" @click="resetAll">恢复计费示例数据</button>
      </div>
    </header>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: active === tab.key }"
        type="button"
        @click="active = tab.key"
      >{{ tab.label }}</button>
    </div>

    <BillsTab v-if="active === 'bills'" />
    <ReportsTab v-else-if="active === 'reports'" />
    <AgreementsTab v-else-if="active === 'agreements'" />
    <PolicyTab v-else />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { resetBilling } from '@/data/billing/store'
import BillsTab from './BillsTab.vue'
import ReportsTab from './ReportsTab.vue'
import AgreementsTab from './AgreementsTab.vue'
import PolicyTab from './PolicyTab.vue'

const tabs = [
  { key: 'bills', label: '结算账单' },
  { key: 'reports', label: '班组服务上报' },
  { key: 'agreements', label: '协议与服务单价' },
  { key: 'policy', label: '结算口径' },
] as const

const active = ref<(typeof tabs)[number]['key']>('bills')

function resetAll() {
  if (window.confirm('将恢复计费模块的全部示例数据，当前改动会丢失，确定吗？')) {
    resetBilling()
    active.value = 'bills'
    window.location.reload()
  }
}
</script>

<style scoped>
.tab-bar { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.tab-btn { border: none; background: none; padding: 8px 16px; cursor: pointer; font-size: 14px; color: var(--muted); border-bottom: 2px solid transparent; }
.tab-btn.active { color: var(--brand); border-bottom-color: var(--brand); font-weight: 600; }
</style>
