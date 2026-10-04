# 机场地面保障作业管理平台

面向航班保障、机位分配、廊桥靠接、摆渡车调度、行李装卸、航油加注、除冰作业与延误处置的一体化机场地面保障作业工作台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 航班保障 | `flight` | 航班保障任务 | 保障编号、航班号、机型 |
| 机位分配 | `stand` | 停机位 | 机位编号、机位类型、适用机型 |
| 廊桥靠接 | `bridge` | 廊桥作业 | 作业编号、廊桥编号、对应机位 |
| 摆渡车调度 | `shuttle` | 摆渡车 | 车辆编号、核载人数、驾驶员 |
| 行李装卸 | `baggage` | 行李作业 | 作业编号、航班号、行李件数 |
| 机务勤务 | `line` | 勤务任务 | 任务编号、航班号、勤务项目 |
| 航油加注 | `fueling` | 加油作业 | 作业编号、航班号、油品规格 |
| 除冰作业 | `deice` | 除冰任务 | 任务编号、航班号、除冰液型号 |
| 地面电源 | `gpu` | 电源车 | 设备编号、设备类型、功率等级 |
| 航空器牵引 | `tow` | 牵引任务 | 任务编号、航班号、牵引车号 |
| 航空配餐 | `catering` | 配餐作业 | 作业编号、航班号、餐食数量 |
| 客舱清洁 | `cabin` | 清洁作业 | 作业编号、航班号、清洁班组 |
| 保障班组 | `team` | 保障班组 | 班组编号、班组名称、负责区域 |
| 特种车辆维保 | `vehmaint` | 维保记录 | 维保单号、车辆编号、维保类型 |
| 要客保障 | `vip` | 要客保障单 | 保障编号、航班号、要客等级 |
| 延误处置 | `delay` | 延误事件 | 事件编号、航班号、延误原因 |
| 机坪安全巡查 | `apron` | 巡查记录 | 巡查编号、巡查区域、巡查人员 |
| 保障资源调度 | `resplan` | 资源计划 | 计划编号、保障时段、机位需求 |
| 地面保障计费结算 | `views/billing` | 协议/单价/上报/账单 | 见下节 |

## 地面保障计费结算

独立的结算工作台（导航「地面保障计费结算」，存储键 `airport-ground-ops:billing`，与通用台账
`airport-ground-ops:entries` 分开），代码在 `frontend/src/data/billing/`：

- **按航班归集**：班组服务上报（加油、廊桥、配餐……）按 航班+服务日期 归集成一张账单，逐项挂
  服务单价与数量（`engine.ts` 的 `createBill` / `linesFromReports`）。
- **重复上报去重**：同航班 + 同服务日期 + 同服务项 + 同机位档次视为一条，取上报最早的保留，
  其余班组并入来源班组、只计一次金额（`dedupeReports`）。
- **唯一口径**：机位档次系数、跨天计天方式（自然日含首尾 / 每满 24 小时）全局只有一份
  （`BillingPolicy`）。**账单金额不落库**，每次查看、导出都按当前口径实时计算；口径改版本后，
  已确认、归档的账单同样立即按新口径重算，账单上标「已重算」。
- **协议有效期**：出账与提交审核都校验航司服务协议有效期，协议过期一律挡回，不许出账。
- **状态机**：草稿 → 提交审核 → 确认账单 → 归档，只允许相邻流转，跳步一律挡回；审核可退回草稿。
- **审核回写**：确认账单时把审核结论、关联账单、审核时间回写到保障资源调度同航班的资源缺口
  清单；资源调度页的应收费用实时读计费引擎（`receivableForFlight`），两边永远同一套数。
- **对账导出**：确认/归档账单可导出单航班结算单，并可按航司把多张账单打包成一份对账 CSV。

核心规则有一组可执行校验：

```bash
cd frontend
node -e "require('esbuild').build({entryPoints:['scripts/verify-billing.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/verify-billing.mjs'}).then(()=>{})" \
  && node /tmp/verify-billing.mjs
```

（脚本使用相对 `scripts/` 的 `../src/...` 路径导入，需在 `frontend/` 目录下执行。）

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `airport-ground-ops:entries` 这一项，或调用 `resetModule(模块)`。
