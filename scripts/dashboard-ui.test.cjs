const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const report = fs.readFileSync(path.join(root, 'src/components/ExpenseSubmissionsTable.jsx'), 'utf8')
const formulas = report.slice(report.indexOf('  const busOptions ='), report.indexOf('  const reportingScope ='))
assert.ok(formulas.includes('const summaryProfit ='), 'Existing accounting formula boundary must exist')
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-10T00:00:00'])) }
}
const submissions = [
  { id: 201, bus_no: 'BUS-ONE', expense_date: '2026-11-10', route_code: 'KTY_CMB', first_leg_date: '2026-11-09', return_leg_date: '2026-11-10', gross_revenue: 120000, total_expense: 60000, first_leg_share: 36000, return_leg_share: 24000, status: 'locked' },
  { id: 202, bus_no: 'BUS-TWO', expense_date: '2026-11-09', route_code: 'CMB_KTY', first_leg_date: '2026-11-08', return_leg_date: '2026-11-09', gross_revenue: 40000, total_expense: 50000, first_leg_share: 25000, return_leg_share: 25000, status: 'locked' },
]
const revenueEntries = [
  { travel_date: '2026-11-09', route_code: 'KTY_CMB', bus_no: 'BUS-ONE', total_revenue: 90000 },
  { travel_date: '2026-11-10', route_code: 'CMB_KTY', bus_no: 'BUS-ONE', total_revenue: 30000 },
]
const dailyRevenue = [
  { travel_date: '2026-11-08', route_code: 'CMB_KTY', registration_no: 'BUS-TWO', total_revenue: 10000, passenger_count: 2 },
  { travel_date: '2026-11-09', route_code: 'KTY_CMB', registration_no: 'BUS-TWO', total_revenue: 30000, passenger_count: 6 },
]
const monthlyExpenses = [
  { expense_date: '2026-11-01', bus_no: 'BUS-ONE', expense_source: 'monthly', amount: 5000 },
  { expense_date: '2026-11-01', bus_no: 'BUS-TWO', category: 'Monthly Expense', amount: 7000 },
  { expense_date: '2026-10-01', bus_no: 'BUS-ONE', expense_source: 'monthly', amount: 9000 },
]
function calculate(extra = {}) {
  return JSON.parse(JSON.stringify(vm.runInNewContext(formulas + '\n;({activeRows,summaryRevenue,summaryExpenses,summaryProfit,summaryMonthlyExpenses,chartEntries,busOptions})', {
    submissions, revenueEntries, dailyRevenue, monthlyExpenses, trips: [], view: 'trip', dateSearch: '', busSearch: '', period: 'all', monthSearch: '2026-11',
    useMemo: fn => fn(), Date: FixtureDate, ...extra,
  })))
}

test('dashboard Profit Report preserves Trip totals and losses without adding monthly costs outside Month mode', () => {
  const result = calculate()
  assert.deepEqual([result.summaryRevenue, result.summaryExpenses, result.summaryProfit, result.summaryMonthlyExpenses], [160000, 110000, 50000, 0])
  assert.equal(result.activeRows.length, 2)
  assert.equal(result.chartEntries[1].gross_revenue - result.chartEntries[1].total_expense, -10000)
})
test('dashboard Route mode preserves allocation rules and sums to the same ledger totals', () => {
  const result = calculate({ view: 'route' })
  assert.deepEqual(result.activeRows.map(row => [row.route_code, row.gross_revenue, row.total_expense]), [
    ['KTY_CMB', 90000, 36000], ['CMB_KTY', 30000, 24000], ['CMB_KTY', 10000, 25000], ['KTY_CMB', 30000, 25000],
  ])
  assert.deepEqual([result.summaryRevenue, result.summaryExpenses, result.summaryProfit], [160000, 110000, 50000])
})
test('dashboard Month summary preserves bus-scoped monthly costs and monthly chart totals', () => {
  const result = calculate({ period: 'month', busSearch: 'BUS-ONE' })
  assert.deepEqual([result.summaryRevenue, result.summaryExpenses, result.summaryProfit, result.summaryMonthlyExpenses], [120000, 65000, 55000, 5000])
  assert.equal(result.chartEntries.length, 1)
  assert.deepEqual([result.chartEntries[0].gross_revenue, result.chartEntries[0].total_expense], [120000, 65000])
  assert.equal(calculate({ period: 'month' }).summaryMonthlyExpenses, 12000)
})
test('dashboard financial date, week and bus filters preserve existing boundaries and empty results', () => {
  assert.equal(calculate({ dateSearch: '2026-11-09' }).summaryProfit, -10000)
  assert.equal(calculate({ busSearch: 'bus-one' }).summaryProfit, 60000)
  assert.equal(calculate({ period: 'week', submissions: [...submissions, { expense_date: '2026-11-03', gross_revenue: 999999 }] }).summaryRevenue, 160000)
  assert.deepEqual(calculate({ dateSearch: '2001-01-01' }).activeRows, [])
  assert.deepEqual([calculate({ submissions: [] }).summaryRevenue, calculate({ submissions: [] }).summaryProfit], [0, 0])
})
test('dashboard route allocation fallback keeps saved revenue and expense conserved', () => {
  const result = calculate({ view: 'route', revenueEntries: [], dailyRevenue: [], submissions: [submissions[0]] })
  assert.deepEqual(result.activeRows.map(row => row.gross_revenue), [72000, 48000])
  assert.deepEqual([result.summaryRevenue, result.summaryExpenses, result.summaryProfit], [120000, 60000, 60000])
})

const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
const chartMemo = app.slice(app.indexOf('  const seatBookingCharts = useMemo('), app.indexOf('  const filteredTrips = useMemo('))
function charts(seatChartMonth = '2026-11', dashboardTrip = '') {
  return JSON.parse(JSON.stringify(vm.runInNewContext(chartMemo + '\n;seatBookingCharts', {
    adminStats: { dailyRevenue: [...dailyRevenue, { travel_date: '2026-11-09', route_code: 'KTY_CMB', passenger_count: 4, trip_id: 101 }] },
    seatChartMonth, dashboardTrip, useMemo: fn => fn(), measureDashboardChart: (_, fn) => fn(),
  })))
}
test('both dashboard travel-date charts preserve monthly day and booking-count calculations', () => {
  const result = charts()
  assert.deepEqual(result.map(chart => chart.code), ['KTY_CMB', 'CMB_KTY'])
  assert.equal(result[0].dates.length, 30)
  assert.equal(result[0].counts[8], 10)
  assert.equal(result[1].counts[7], 2)
  assert.equal(charts('2026-11', '101')[0].counts[8], 4)
  assert.equal(charts('2026-10')[0].counts.reduce((a, b) => a + b, 0), 0)
})
