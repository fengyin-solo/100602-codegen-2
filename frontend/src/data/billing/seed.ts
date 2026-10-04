import type { BillingState } from './store'

/** 计费结算示例数据：今天是 2026-10-04，含有效/过期协议、跨天保障、班组重复上报等场景。 */
export const BILLING_SEED: BillingState = {
  seq: {
    agreements: 3,
    prices: 11,
    reports: 14,
    bills: 1,
  } as Record<string, number>,
  agreements: [
    {
      id: 1,
      code: 'AGR-2026-001',
      airline: '中国国际航空',
      airlineCode: 'CA',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      contact: '王结算 010-88001',
    },
    {
      id: 2,
      code: 'AGR-2026-002',
      airline: '中国东方航空',
      airlineCode: 'MU',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      contact: '李对账 021-66002',
    },
    {
      id: 3,
      code: 'AGR-2025-018',
      airline: '中国南方航空',
      airlineCode: 'CZ',
      startDate: '2025-01-01',
      endDate: '2026-06-30',
      contact: '赵清欠 020-22003',
    },
  ],
  prices: [
    { id: 1, serviceCode: 'FUEL', serviceName: '航油加注', unit: '吨', basePrice: 850, pricingMode: 'fixed', usesCrossDay: false },
    { id: 2, serviceCode: 'BRIDGE', serviceName: '廊桥靠接', unit: '次', basePrice: 600, pricingMode: 'tier', usesCrossDay: false },
    { id: 3, serviceCode: 'CATER', serviceName: '航空配餐', unit: '份', basePrice: 35, pricingMode: 'fixed', usesCrossDay: false },
    { id: 4, serviceCode: 'CABIN', serviceName: '客舱清洁', unit: '次', basePrice: 450, pricingMode: 'tier', usesCrossDay: false },
    { id: 5, serviceCode: 'GPU', serviceName: '地面电源', unit: '天', basePrice: 600, pricingMode: 'fixed', usesCrossDay: true },
    { id: 6, serviceCode: 'TOW', serviceName: '航空器牵引', unit: '次', basePrice: 900, pricingMode: 'tier', usesCrossDay: false },
    { id: 7, serviceCode: 'DEICE', serviceName: '航空器除冰', unit: '架次', basePrice: 2200, pricingMode: 'tier', usesCrossDay: false },
    { id: 8, serviceCode: 'BAG', serviceName: '行李装卸', unit: '架次', basePrice: 380, pricingMode: 'tier', usesCrossDay: false },
    { id: 9, serviceCode: 'LINE', serviceName: '机务勤务', unit: '次', basePrice: 260, pricingMode: 'fixed', usesCrossDay: false },
    { id: 10, serviceCode: 'SHUTTLE', serviceName: '摆渡车', unit: '班次', basePrice: 180, pricingMode: 'fixed', usesCrossDay: false },
    { id: 11, serviceCode: 'VIP', serviceName: '要客保障', unit: '次', basePrice: 1500, pricingMode: 'tier', usesCrossDay: false },
  ],
  policy: {
    version: 3,
    updatedAt: '2026-09-15 10:00',
    standTiers: [
      { tier: '近机位', coefficient: 1.3 },
      { tier: '远机位', coefficient: 1.0 },
      { tier: '除冰坪', coefficient: 1.5 },
    ],
    crossDayMode: 'calendar',
  },
  reports: [
    // MU5101：既加油又靠桥还配餐；廊桥被两个班组重复上报。
    { id: 1, reportNo: 'RPT-20261002-001', flightNo: 'MU5101', airlineCode: 'MU', serviceDate: '2026-10-02', serviceCode: 'FUEL', serviceName: '航油加注', quantity: 12.5, unit: '吨', team: '加油班', reportedAt: '2026-10-02 09:20', consumed: true, billId: 1 },
    { id: 2, reportNo: 'RPT-20261002-002', flightNo: 'MU5101', airlineCode: 'MU', serviceDate: '2026-10-02', serviceCode: 'BRIDGE', serviceName: '廊桥靠接', quantity: 1, unit: '次', standTier: '近机位', team: '廊桥班', reportedAt: '2026-10-02 07:10', consumed: true, billId: 1 },
    { id: 3, reportNo: 'RPT-20261002-003', flightNo: 'MU5101', airlineCode: 'MU', serviceDate: '2026-10-02', serviceCode: 'BRIDGE', serviceName: '廊桥靠接', quantity: 1, unit: '次', standTier: '近机位', team: '桥载复核组', reportedAt: '2026-10-02 07:18', consumed: true, billId: 1, duplicateOf: 2 },
    { id: 4, reportNo: 'RPT-20261002-004', flightNo: 'MU5101', airlineCode: 'MU', serviceDate: '2026-10-02', serviceCode: 'CATER', serviceName: '航空配餐', quantity: 168, unit: '份', team: '配餐公司', reportedAt: '2026-10-02 06:40', consumed: true, billId: 1 },
    { id: 5, reportNo: 'RPT-20261002-005', flightNo: 'MU5101', airlineCode: 'MU', serviceDate: '2026-10-02', serviceCode: 'CABIN', serviceName: '客舱清洁', quantity: 1, unit: '次', standTier: '近机位', team: '客舱清洁班', reportedAt: '2026-10-02 07:55', consumed: false },
    // CA1831：跨天供电（10-03 22:00 到 10-04 02:00），配餐双班组重复上报。
    { id: 6, reportNo: 'RPT-20261003-006', flightNo: 'CA1831', airlineCode: 'CA', serviceDate: '2026-10-03', serviceCode: 'GPU', serviceName: '地面电源', quantity: 4, unit: '小时', startAt: '2026-10-03 22:00', endAt: '2026-10-04 02:00', team: '电源车班', reportedAt: '2026-10-04 02:10', consumed: false },
    { id: 7, reportNo: 'RPT-20261003-007', flightNo: 'CA1831', airlineCode: 'CA', serviceDate: '2026-10-03', serviceCode: 'CATER', serviceName: '航空配餐', quantity: 142, unit: '份', team: '配餐公司', reportedAt: '2026-10-03 21:10', consumed: false },
    { id: 8, reportNo: 'RPT-20261003-008', flightNo: 'CA1831', airlineCode: 'CA', serviceDate: '2026-10-03', serviceCode: 'CATER', serviceName: '航空配餐', quantity: 142, unit: '份', team: '过站保障组', reportedAt: '2026-10-03 21:25', consumed: false },
    { id: 9, reportNo: 'RPT-20261003-009', flightNo: 'CA1831', airlineCode: 'CA', serviceDate: '2026-10-03', serviceCode: 'TOW', serviceName: '航空器牵引', quantity: 1, unit: '次', standTier: '远机位', team: '牵引车班', reportedAt: '2026-10-03 20:30', consumed: false },
    // CZ3101：协议 2026-06-30 已过期，用于拦截出账。
    { id: 10, reportNo: 'RPT-20261003-010', flightNo: 'CZ3101', airlineCode: 'CZ', serviceDate: '2026-10-03', serviceCode: 'FUEL', serviceName: '航油加注', quantity: 9.8, unit: '吨', team: '加油班', reportedAt: '2026-10-03 18:02', consumed: false },
    { id: 11, reportNo: 'RPT-20261003-011', flightNo: 'CZ3101', airlineCode: 'CZ', serviceDate: '2026-10-03', serviceCode: 'BRIDGE', serviceName: '廊桥靠接', quantity: 1, unit: '次', standTier: '近机位', team: '廊桥班', reportedAt: '2026-10-03 17:20', consumed: false },
  ],
  bills: [
    {
      id: 1,
      billNo: 'BILL-20261002-MU5101',
      flightNo: 'MU5101',
      airlineCode: 'MU',
      agreementId: 2,
      serviceDate: '2026-10-02',
      standNo: '213',
      status: '草稿',
      createdAt: '2026-10-03 09:00',
      policyVersion: 3,
      lines: [
        { reportId: 1, reportNo: 'RPT-20261002-001', serviceCode: 'FUEL', serviceName: '航油加注', billedQty: 12.5, unit: '吨', teams: ['加油班'], sourceCount: 1 },
        { reportId: 2, reportNo: 'RPT-20261002-002', serviceCode: 'BRIDGE', serviceName: '廊桥靠接', billedQty: 1, unit: '次', teams: ['廊桥班', '桥载复核组'], sourceCount: 2, standTier: '近机位' },
        { reportId: 4, reportNo: 'RPT-20261002-004', serviceCode: 'CATER', serviceName: '航空配餐', billedQty: 168, unit: '份', teams: ['配餐公司'], sourceCount: 1 },
      ],
    },
  ],
}
