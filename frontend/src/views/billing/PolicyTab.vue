<template>
  <div>
    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">当前口径版本</span>
        <strong class="stat-value">v{{ state.policy.version }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">最近更新</span>
        <strong class="stat-value small">{{ state.policy.updatedAt }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">跨天计天方式</span>
        <strong class="stat-value small">
          {{ state.policy.crossDayMode === 'calendar' ? '按自然日（含首尾）' : '每满24小时计一天' }}
        </strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">受影响账单（非草稿）</span>
        <strong class="stat-value small">{{ stale.length }} 张</strong>
      </article>
    </div>

    <div class="notice">
      口径全局只有一份。保存即升版本，<b>已经生成的账单（含已确认、归档）一律按新口径实时重算</b>，
      不会出现老账单按老口径、新账单按新口径两套数。账单金额不随账单落库，导出的对账文件也始终按当前口径计算。
    </div>

    <h3 class="block-title">机位档次折算系数</h3>
    <table class="data-table tier-table">
      <thead><tr><th>机位档次</th><th>折算系数</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="(tier, index) in tiers" :key="index">
          <td><input v-model="tier.tier" placeholder="如 近机位" /></td>
          <td><input v-model.number="tier.coefficient" type="number" step="0.05" min="0" /></td>
          <td><button class="link danger" type="button" @click="tiers.splice(index, 1)">删除档次</button></td>
        </tr>
      </tbody>
    </table>
    <button class="btn" type="button" @click="tiers.push({ tier: '', coefficient: 1 })">增加档次</button>

    <h3 class="block-title">跨天保障计天方式</h3>
    <div class="mode-box">
      <label class="mode-line">
        <input v-model="crossDayMode" type="radio" value="calendar" />
        <span>
          <b>按自然日</b>：保障占用到几天就计几天，含开始日与结束日。
          <em>例：2026-10-03 22:00 至 2026-10-04 02:00 → 2 天</em>
        </span>
      </label>
      <label class="mode-line">
        <input v-model="crossDayMode" type="radio" value="24h" />
        <span>
          <b>每满 24 小时计一天</b>：不足 24 小时按一天。
          <em>例：同一时段 4 小时 → 1 天</em>
        </span>
      </label>
    </div>

    <div class="save-bar">
      <button class="btn primary" type="button" @click="save">保存并按新口径重算全部账单</button>
      <span v-if="message" :class="error ? 'error-text' : 'ok-msg'">{{ message }}</span>
    </div>

    <p v-if="stale.length" class="page-foot">
      当前口径下需要财务关注（出账口径早于现行版本）：{{ stale.map((s) => `${s.billNo}(v${s.oldVersion})`).join('、') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { billingState } from '@/data/billing/store'
import { savePolicy, staleBills } from '@/data/billing/admin'
import type { CrossDayMode, StandTier } from '@/data/billing/types'

const state = ref(billingState())
const tiers = ref<StandTier[]>(state.value.policy.standTiers.map((t) => ({ ...t })))
const crossDayMode = ref<CrossDayMode>(state.value.policy.crossDayMode)
const message = ref('')
const error = ref(false)
const stale = ref(staleBills())

function save() {
  message.value = ''
  error.value = false
  const result = savePolicy({ standTiers: tiers.value, crossDayMode: crossDayMode.value })
  message.value = result.message
  error.value = !result.ok
  if (result.ok) {
    state.value = billingState()
    stale.value = staleBills()
  }
}
</script>

<style scoped>
.stat-value.small { font-size: 15px; }
.notice { background: #eff8ff; border: 1px solid #b2ddff; border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
.block-title { font-size: 14px; margin: 16px 0 8px; }
.tier-table { max-width: 460px; }
.tier-table input { width: 100%; padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; }
.link.danger { color: #b42318; }
.mode-box { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; max-width: 640px; }
.mode-line { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.mode-line em { display: block; color: var(--muted); font-style: normal; font-size: 12px; margin-top: 2px; }
.save-bar { display: flex; align-items: center; gap: 14px; margin-top: 16px; }
.ok-msg { color: #067647; font-size: 13px; }
</style>
