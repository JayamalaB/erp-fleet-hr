const { createApp } = require('../src/app');
const { startTestDb, stopTestDb } = require('./helpers/testDb');
const { registerAndLogin, api } = require('./helpers/authHelpers');
const { publish, dispatchPendingEvents } = require('../src/platform/eventBus');
require('../src/modules/hr/eventHandlers'); // register the trip.completed -> DriverBonusLine subscriber

let app;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

describe('HR/Payroll - worked net-salary scenario', () => {
  let client;
  let companyId;
  let employeeId;
  let payrollRunId;
  const periodStart = new Date(Date.UTC(2026, 0, 1));
  const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59));

  beforeAll(async () => {
    const auth = await registerAndLogin(app, { email: 'owner@transportco.test', companyName: 'Transport Co' });
    client = api(app, auth.accessToken);
    companyId = auth.companyId;

    const empRes = await client.post('/api/hr/employees', { name: 'Ahmad Driver', joinDate: '2023-01-01' }).expect(201);
    employeeId = empRes.body._id;

    const runRes = await client
      .post('/api/hr/payroll-runs', { periodLabel: '2026-01', periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() })
      .expect(201);
    payrollRunId = runRes.body._id;

    await client.post('/api/hr/salary', { employeeId, basicSalary: 5000, effectiveFrom: periodStart.toISOString() }).expect(201);
    await client
      .post('/api/hr/allowance-deductions', { employeeId, kind: 'allowance', label: 'Monthly Allowance', amount: 500, effectiveFrom: periodStart.toISOString() })
      .expect(201);
    await client
      .post('/api/hr/allowance-deductions', { employeeId, kind: 'deduction', label: 'Deduction', amount: 300, effectiveFrom: periodStart.toISOString() })
      .expect(201);
    await client.post('/api/hr/loans', { employeeId, principal: 2000, installmentAmount: 500, startPeriod: '2026-01' }).expect(201);

    // Simulate Fleet publishing trip.completed (docs 5.7) - HR never calls
    // into Fleet directly, it only reacts to this event.
    await publish(
      'trip.completed',
      companyId,
      {
        tripId: 'trip-scenario-1',
        companyId,
        employeeId,
        isSubcontractor: false,
        amount: 1200,
        completedAt: new Date(Date.UTC(2026, 0, 15)).toISOString(),
      },
      null
    );
    await dispatchPendingEvents();
  });

  test('Net Salary = Basic + Allowances + Overtime + Trip Bonuses - Deductions - Loan Installments = 5,900', async () => {
    await client.post(`/api/hr/payroll-runs/${payrollRunId}/employees/${employeeId}/calculate`, {}).expect(200);

    const linesRes = await client.get(`/api/hr/payroll-runs/${payrollRunId}/lines`).expect(200);
    const line = linesRes.body.find((l) => l.employeeId === employeeId);

    expect(line.basic).toBe(5000);
    expect(line.allowances).toBe(500);
    expect(line.overtime).toBe(0);
    expect(line.tripBonuses).toBe(1200);
    expect(line.deductions).toBe(300);
    expect(line.loanInstallments).toBe(500);
    expect(line.netSalary).toBe(5900);
  });

  test('the trip bonus is never paid twice, even if the same trip is published again', async () => {
    await publish(
      'trip.completed',
      companyId,
      { tripId: 'trip-scenario-1', companyId, employeeId, isSubcontractor: false, amount: 1200, completedAt: new Date(Date.UTC(2026, 0, 15)).toISOString() },
      null
    );
    await dispatchPendingEvents();

    const DriverBonusLine = require('../src/modules/hr/models/DriverBonusLine');
    const { runWithTenant } = require('../src/platform/tenantContext');
    const count = await runWithTenant(companyId, async () => DriverBonusLine.countDocuments({ tripId: 'trip-scenario-1' }));
    expect(count).toBe(1);
  });

  test('subcontractor trips never create an employee payroll bonus', async () => {
    await publish(
      'trip.completed',
      companyId,
      { tripId: 'trip-subcontractor-1', companyId, employeeId, isSubcontractor: true, amount: 999, completedAt: new Date(Date.UTC(2026, 0, 16)).toISOString() },
      null
    );
    await dispatchPendingEvents();

    const DriverBonusLine = require('../src/modules/hr/models/DriverBonusLine');
    const { runWithTenant } = require('../src/platform/tenantContext');
    const count = await runWithTenant(companyId, async () => DriverBonusLine.countDocuments({ tripId: 'trip-subcontractor-1' }));
    expect(count).toBe(0);
  });

  test('a locked payroll run rejects recalculation until reopened', async () => {
    await client.post(`/api/hr/payroll-runs/${payrollRunId}/calculate`, {}).expect(200);
    await client.post(`/api/hr/payroll-runs/${payrollRunId}/lock`, {}).expect(200);

    const recalcAttempt = await client.post(`/api/hr/payroll-runs/${payrollRunId}/employees/${employeeId}/calculate`, {});
    expect(recalcAttempt.status).toBe(409);

    await client.post(`/api/hr/payroll-runs/${payrollRunId}/reopen`, {}).expect(200);
    await client.post(`/api/hr/payroll-runs/${payrollRunId}/employees/${employeeId}/calculate`, {}).expect(200);
  });
});

describe('HR/Payroll - termination and end-of-service', () => {
  const { calculateEndOfService } = require('../src/modules/hr/services/terminationService');

  test('resignation under 2 years forfeits EOS entirely', () => {
    const result = calculateEndOfService({ lastBasicSalary: 5000, yearsOfService: 1.5, terminationType: 'resignation' });
    expect(result.eosAmount).toBe(0);
  });

  test('resignation between 2 and 5 years pays one third', () => {
    const result = calculateEndOfService({ lastBasicSalary: 5000, yearsOfService: 3, terminationType: 'resignation' });
    // gross = 0.5*5000 * 3 years = 7500; one third = 2500
    expect(result.grossEos).toBe(7500);
    expect(result.eosAmount).toBe(2500);
  });

  test('employer-initiated termination pays full EOS regardless of tenure', () => {
    const result = calculateEndOfService({ lastBasicSalary: 5000, yearsOfService: 1, terminationType: 'termination' });
    expect(result.eosAmount).toBe(2500); // 0.5 * 5000 * 1 year, full payout fraction
  });

  test('service beyond 5 years accrues at one month per year for the extra years', () => {
    // 7 years: first 5 at 0.5x, next 2 at 1x => 2.5 + 2 = 4.5 months of basic
    const result = calculateEndOfService({ lastBasicSalary: 4000, yearsOfService: 7, terminationType: 'termination' });
    expect(result.grossEos).toBe(4.5 * 4000);
    expect(result.eosAmount).toBe(4.5 * 4000);
  });

  test('terminateEmployee end-to-end: closes salary, freezes an EndOfServiceRecord, and excludes the employee from future payroll', async () => {
    const auth = await registerAndLogin(app, { email: 'owner@terminationco.test', companyName: 'Termination Co' });
    const client = api(app, auth.accessToken);

    const empRes = await client.post('/api/hr/employees', { name: 'Sara Ex-Employee', joinDate: '2021-01-01' }).expect(201);
    const employeeId = empRes.body._id;
    await client.post('/api/hr/salary', { employeeId, basicSalary: 6000, effectiveFrom: '2021-01-01' }).expect(201);

    const terminationRes = await client
      .post('/api/hr/terminations', { employeeId, terminationDate: '2026-01-10', terminationType: 'termination' })
      .expect(201);
    expect(terminationRes.body.eosAmount).toBeGreaterThan(0);

    const employeeAfter = await client.get(`/api/hr/employees/${employeeId}`).expect(200);
    expect(employeeAfter.body.status).toBe('terminated');

    // A payroll run generated for a period after termination excludes this employee entirely.
    const runRes = await client
      .post('/api/hr/payroll-runs', { periodLabel: '2026-02', periodStart: '2026-02-01', periodEnd: '2026-02-28' })
      .expect(201);
    await client.post(`/api/hr/payroll-runs/${runRes.body._id}/calculate`, {}).expect(200);
    const lines = await client.get(`/api/hr/payroll-runs/${runRes.body._id}/lines`).expect(200);
    expect(lines.body.find((l) => l.employeeId === employeeId)).toBeUndefined();
  });
});
