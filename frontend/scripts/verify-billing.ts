import {
  createBill,
  deleteBill,
  exportAirlinePackage,
  exportBill,
  flightCandidates,
  listBillViews,
  reCollectBill,
  receivableForFlight,
  transitionBill,
} from '../src/data/billing/engine'
import { listRows } from '../src/data/local-store'
import { billingState, resetBilling } from '../src/data/billing/store'
import { savePolicy } from '../src/data/billing/admin'

let passed = 0
function check(name: string, cond: boolean, extra = '') {
  if (!cond) throw new Error(`FAIL: ${name} ${extra}`)
  passed++
  console.log(`PASS: ${name} ${extra}`)
}

// 1. 初始候选：MU5101 草稿已存在不出现；CA1831 有重复；CZ3101 过期
resetBilling()
const candidates = flightCandidates()
const ca = candidates.find((c) => c.flightNo === 'CA1831')
const cz = candidates.find((c) => c.flightNo === 'CZ3101')
check('CA1831 候选存在', !!ca)
check('CA1831 去重数=1（配餐两班组）', ca?.duplicateCount === 1, `dup=${ca?.duplicateCount}`)
check('CA1831 预估金额正确', Math.abs((ca?.estimatedAmount ?? 0) - 7070) < 0.01, `amount=${ca?.estimatedAmount}`)
// GPU 600×2天=1200 + CATER 142×35=4970 + TOW 900×1.0=900 = 7070
check('CZ3101 协议过期标记', cz?.agreementActive === false)

// 2. 过期协议禁止出账
const czRes = createBill('CZ3101', '2026-10-03')
check('过期协议出账被挡', czRes.ok === false && czRes.message.includes('过期'))

// 3. CA1831 生成账单，重复上报只计一次
const caRes = createBill('CA1831', '2026-10-03')
check('CA1831 出账成功', caRes.ok === true, caRes.message)
const caBill = listBillViews().find((b) => b.flightNo === 'CA1831')
check('CA1831 明细=3 项（4条上报去重1）', caBill?.lines.length === 3, `lines=${caBill?.lines.length}`)
const cater = caBill?.lineViews.find((l) => l.serviceCode === 'CATER')
check('配餐来源班组含2个、sourceCount=2', cater?.teams.length === 2 && cater.sourceCount === 2)
check('配餐只计一份金额 4970', Math.abs(cater?.amount ?? 0) === 4970, `${cater?.amount}`)
const gpu = caBill?.lineViews.find((l) => l.serviceCode === 'GPU')
check('GPU 跨天按自然日=2天', gpu?.billedQty === 2 && Math.abs(gpu.amount - 1200) < 0.01, `qty=${gpu?.billedQty} amount=${gpu?.amount}`)
check('CA1831 合计=7070', Math.abs(caBill?.totalAmount ?? 0) === 7070, `${caBill?.totalAmount}`)
const state = billingState()
check('重复上报标记 duplicateOf', state.reports.find((r) => r.id === 8)?.duplicateOf === 7)

// 4. 状态机跳步：草稿不能直接审核确认/归档
const id = caBill!.id
check('草稿→归档被挡', transitionBill(id, '归档').ok === false)
check('草稿→审核确认被挡', transitionBill(id, '审核确认').ok === false)
// 正常提交
check('草稿→提交审核', transitionBill(id, '提交审核').ok === true)
check('提交审核→归档被挡', transitionBill(id, '归档').ok === false)
// 退回
check('审核退回', transitionBill(id, '审核退回', '金额存疑').ok === true)
check('退回后是草稿', listBillViews().find((b) => b.id === id)?.status === '草稿')
// 再提交再确认，触发回写
transitionBill(id, '提交审核')
const confirmRes = transitionBill(id, '审核确认')
check('审核确认成功并回写资源计划', confirmRes.ok === true && confirmRes.message.includes('回写'), confirmRes.message)
const recv = receivableForFlight('CA1831')
check('资源调度应收=账单金额同一套数', Math.abs(recv?.amount ?? 0) === 7070, `${recv?.amount}`)
const planRow = listRows('resplan').find((r) => String(r['当前航班']) === 'CA1831')
check('缺口清单写入审核结论', planRow?.['审核结论'] === '已确认应收' && !!planRow?.['关联账单'])

// 5. 口径升级：近机位系数 1.3→1.1，跨天改 24h；CA账单 GPU 变 1天=600
const beforeMu = listBillViews().find((b) => b.flightNo === 'MU5101')?.totalAmount
// MU: FUEL 12.5*850=10625, BRIDGE 600*1*1.3=780, CATER 168*35=5880 => 17285
check('MU5101 改口径前=17285', beforeMu === 17285, `${beforeMu}`)
const policyRes = savePolicy({
  standTiers: [{ tier: '近机位', coefficient: 1.1 }, { tier: '远机位', coefficient: 1.0 }, { tier: '除冰坪', coefficient: 1.5 }],
  crossDayMode: '24h',
})
check('口径升级 v4', policyRes.ok && billingState().policy.version === 4, policyRes.message)
const afterMu = listBillViews().find((b) => b.flightNo === 'MU5101')
// 桥 600*1.1=660 -> 10625+660+5880=17165
check('已存在的MU账单按新口径重算=17165', afterMu?.totalAmount === 17165, `${afterMu?.totalAmount}`)
check('MU账单标记 policyStale', afterMu?.policyStale === true)
const afterCaGpu = listBillViews().find((b) => b.id === id)?.lineViews.find((l) => l.serviceCode === 'GPU')
check('CA账单 GPU 24h口径变1天=600（已确认账单也重算）', afterCaGpu?.billedQty === 1 && afterCaGpu.amount === 600)
check('资源调度应收随口径同步变', receivableForFlight('CA1831')?.amount === 6470, `${receivableForFlight('CA1831')?.amount}`)
// GPU600 + CATER4970 + TOW900 = 6470

// 6. 导出：确认账单可导出；航司打包
check('CA确认账单可导出', transitionBill(id, '归档').ok === true)
const billExport = exportBill(id)
check('归档账单导出成功', billExport.ok === true && (billExport.data?.content.includes('合计金额') ?? false))
const pkg = exportAirlinePackage('CA')
check('CA航司打包含汇总', pkg.ok === true && (pkg.data?.content.includes('航司对账文件') ?? false))
// MU 草稿不能打包
const pkgMu = exportAirlinePackage('MU')
check('MU无确认账单打包被挡', pkgMu.ok === false)

// 7. 删除草稿释放上报；重新归集
check('MU草稿删除', deleteBill(1).ok === true)
check('删除后MU上报重新待归集', flightCandidates().some((c) => c.flightNo === 'MU5101'))
const reCreate = createBill('MU5101', '2026-10-02')
check('MU重新出账', reCreate.ok === true)
const newMuId = reCreate.data!.id
check('重新归集（新增的清洁上报 id=5 被纳入）', reCollectBill(newMuId).ok === true)
const newMu = listBillViews().find((b) => b.id === newMuId)
check('重归集后明细=4 项（含客舱清洁）', newMu?.lines.length === 4, `${newMu?.lines.length}`)

console.log(`\n全部 ${passed} 项检查通过 ✅`)
