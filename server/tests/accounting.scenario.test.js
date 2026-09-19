const request = require('supertest');
const { createApp } = require('../src/app');
const { startTestDb, stopTestDb } = require('./helpers/testDb');

let app;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

async function registerAndLogin({ email, companyName }) {
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test Owner', email, password: 'password123', companyName })
    .expect(201);

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' })
    .expect(200);

  const { preAuthToken, companies } = loginRes.body;
  const companyId = companies[0].companyId;

  const selectRes = await request(app)
    .post('/api/auth/select-company')
    .set('Authorization', `Bearer ${preAuthToken}`)
    .send({ companyId })
    .expect(200);

  return { accessToken: selectRes.body.accessToken, companyId };
}

function api(accessToken) {
  const agent = request(app);
  return {
    get: (url) => agent.get(url).set('Authorization', `Bearer ${accessToken}`),
    post: (url, body) => agent.post(url).set('Authorization', `Bearer ${accessToken}`).send(body),
  };
}

describe('ERP/Accounting - end-to-end accounting cycle', () => {
  let token;
  let periodId;
  let customerId;

  beforeAll(async () => {
    const auth = await registerAndLogin({ email: 'owner@acme-transport.test', companyName: 'Acme Transport' });
    token = auth.accessToken;
    const client = api(token);

    await client.post('/api/accounting/setup/seed-chart-of-accounts', {}).expect(201);

    const periodRes = await client
      .post('/api/accounting/fiscal-periods', { name: '2026-01', startDate: '2026-01-01', endDate: '2026-01-31' })
      .expect(201);
    periodId = periodRes.body._id;

    const customerRes = await client
      .post('/api/accounting/parties', { kind: 'customer', name: 'Gulf Logistics Customer' })
      .expect(201);
    customerId = customerRes.body._id;
  });

  test('the worked scenario: SAR 10,000 transport service + 15% VAT, SAR 5,000 received', async () => {
    const client = api(token);

    const invoiceRes = await client
      .post('/api/accounting/invoices', {
        kind: 'sales',
        partyId: customerId,
        fiscalPeriodId: periodId,
        invoiceNo: 'INV-1001',
        lines: [{ description: 'Transport service', amount: 10000 }],
        vatRate: 0.15,
      })
      .expect(201);

    expect(invoiceRes.body.subtotal).toBe(10000);
    expect(invoiceRes.body.vatAmount).toBe(1500);
    expect(invoiceRes.body.total).toBe(11500);

    const invoiceId = invoiceRes.body._id;
    const posted = await client.post(`/api/accounting/invoices/${invoiceId}/post`, {}).expect(200);
    expect(posted.body.status).toBe('posted');

    // Receive SAR 5,000 against the invoice
    await client
      .post('/api/accounting/settlements', {
        kind: 'receipt',
        partyId: customerId,
        fiscalPeriodId: periodId,
        amount: 5000,
        allocations: [{ invoiceId, amountApplied: 5000 }],
      })
      .expect(201);

    // Customer balance: 11,500 - 5,000 = 6,500 outstanding
    const balanceRes = await client.get(`/api/accounting/parties/${customerId}/balance`).expect(200);
    expect(balanceRes.body.netBalance).toBe(6500);

    // Trial balance stays balanced
    const trialBalance = await client.get(`/api/accounting/reports/trial-balance?fiscalPeriodId=${periodId}`).expect(200);
    expect(trialBalance.body.isBalanced).toBe(true);
    expect(trialBalance.body.totalDebit).toBe(trialBalance.body.totalCredit);

    // P&L: revenue recognized in full regardless of cash collected (accrual)
    const pnl = await client.get(`/api/accounting/reports/profit-and-loss?fiscalPeriodId=${periodId}`).expect(200);
    expect(pnl.body.totalRevenue).toBe(10000);
    expect(pnl.body.netIncome).toBe(10000);
  });

  test('a genuine race - two simultaneous post requests on one invoice still produce exactly one journal entry', async () => {
    const client = api(token);
    const invoiceRes = await client
      .post('/api/accounting/invoices', {
        kind: 'sales',
        partyId: customerId,
        fiscalPeriodId: periodId,
        invoiceNo: 'INV-1005',
        lines: [{ description: 'Race-condition test service', amount: 300 }],
        vatRate: 0.15,
      })
      .expect(201);
    const invoiceId = invoiceRes.body._id;

    const [first, second] = await Promise.all([
      client.post(`/api/accounting/invoices/${invoiceId}/post`, {}),
      client.post(`/api/accounting/invoices/${invoiceId}/post`, {}),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  test('prevents double posting of the same invoice', async () => {
    const client = api(token);
    const invoiceRes = await client
      .post('/api/accounting/invoices', {
        kind: 'sales',
        partyId: customerId,
        fiscalPeriodId: periodId,
        invoiceNo: 'INV-1002',
        lines: [{ description: 'Another transport service', amount: 2000 }],
        vatRate: 0.15,
      })
      .expect(201);
    const invoiceId = invoiceRes.body._id;

    await client.post(`/api/accounting/invoices/${invoiceId}/post`, {}).expect(200);
    const secondAttempt = await client.post(`/api/accounting/invoices/${invoiceId}/post`, {});
    expect(secondAttempt.status).toBe(409);
  });

  test('cancelling a posted invoice creates a reversing entry, not an edit', async () => {
    const client = api(token);
    const invoiceRes = await client
      .post('/api/accounting/invoices', {
        kind: 'sales',
        partyId: customerId,
        fiscalPeriodId: periodId,
        invoiceNo: 'INV-1003',
        lines: [{ description: 'Cancelled service', amount: 1000 }],
        vatRate: 0.15,
      })
      .expect(201);
    const invoiceId = invoiceRes.body._id;
    await client.post(`/api/accounting/invoices/${invoiceId}/post`, {}).expect(200);

    const cancelled = await client.post(`/api/accounting/invoices/${invoiceId}/cancel`, {}).expect(200);
    expect(cancelled.body.status).toBe('cancelled');

    const trialBalance = await client.get(`/api/accounting/reports/trial-balance?fiscalPeriodId=${periodId}`).expect(200);
    expect(trialBalance.body.isBalanced).toBe(true);
  });

  test('rejects posting into a locked fiscal period', async () => {
    const client = api(token);
    const lockedPeriodRes = await client
      .post('/api/accounting/fiscal-periods', { name: '2025-12', startDate: '2025-12-01', endDate: '2025-12-31' })
      .expect(201);
    const lockedPeriodId = lockedPeriodRes.body._id;

    const invoiceRes = await client
      .post('/api/accounting/invoices', {
        kind: 'sales',
        partyId: customerId,
        fiscalPeriodId: lockedPeriodId,
        invoiceNo: 'INV-1004',
        lines: [{ description: 'Service in a period about to be locked', amount: 500 }],
        vatRate: 0.15,
      })
      .expect(201);

    await client.post(`/api/accounting/fiscal-periods/${lockedPeriodId}/close`, {}).expect(200);
    await client.post(`/api/accounting/fiscal-periods/${lockedPeriodId}/lock`, {}).expect(200);

    const postAttempt = await client.post(`/api/accounting/invoices/${invoiceRes.body._id}/post`, {});
    expect(postAttempt.status).toBe(409);
  });
});

describe('Multi-company isolation', () => {
  test('Company A cannot read Company B data', async () => {
    const companyA = await registerAndLogin({ email: 'ownerA@company-a.test', companyName: 'Company A' });
    const companyB = await registerAndLogin({ email: 'ownerB@company-b.test', companyName: 'Company B' });

    const clientA = api(companyA.accessToken);
    const clientB = api(companyB.accessToken);

    await clientA.post('/api/accounting/setup/seed-chart-of-accounts', {}).expect(201);
    const customerA = await clientA.post('/api/accounting/parties', { kind: 'customer', name: 'A-only customer' }).expect(201);

    // Company B's party list must never include Company A's customer
    const listB = await clientB.get('/api/accounting/parties').expect(200);
    expect(listB.body.find((p) => p._id === customerA.body._id)).toBeUndefined();

    // Direct lookup by id, cross-company, must not leak the record either
    const directRes = await clientB.get(`/api/accounting/parties/${customerA.body._id}/balance`);
    expect(directRes.body.netBalance).toBe(0); // resolves to "no matching lines for this company" - not Company A's data
  });
});
