import { useEffect, useState } from 'react';
import { api } from '../api';

function useLoader(loader, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loader()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);
  return [data, error, () => setReloadKey((k) => k + 1)];
}

export default function AccountingPage() {
  const [error, setError] = useState('');
  const [periods, , reloadPeriods] = useLoader(() => api.get('/api/accounting/fiscal-periods'), []);
  const [customers, , reloadCustomers] = useLoader(() => api.get('/api/accounting/parties?kind=customer'), []);
  const [invoices, , reloadInvoices] = useLoader(() => api.get('/api/accounting/invoices'), []);

  const [periodForm, setPeriodForm] = useState({ name: '', startDate: '', endDate: '' });
  const [customerForm, setCustomerForm] = useState({ name: '' });
  const [invoiceForm, setInvoiceForm] = useState({ partyId: '', fiscalPeriodId: '', invoiceNo: '', description: 'Transport service', amount: 10000 });
  const [receiptForm, setReceiptForm] = useState({ partyId: '', fiscalPeriodId: '', invoiceId: '', amount: 5000 });
  const [balance, setBalance] = useState(null);
  const [trialBalance, setTrialBalance] = useState(null);
  const [pnl, setPnl] = useState(null);

  async function run(fn) {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }

  const seedCoa = () => run(async () => {
    await api.post('/api/accounting/setup/seed-chart-of-accounts', {});
  });

  const createPeriod = (e) => { e.preventDefault(); run(async () => {
    await api.post('/api/accounting/fiscal-periods', periodForm);
    reloadPeriods();
  }); };

  const createCustomer = (e) => { e.preventDefault(); run(async () => {
    await api.post('/api/accounting/parties', { kind: 'customer', name: customerForm.name });
    reloadCustomers();
  }); };

  const createAndPostInvoice = (e) => { e.preventDefault(); run(async () => {
    const invoice = await api.post('/api/accounting/invoices', {
      kind: 'sales',
      partyId: invoiceForm.partyId,
      fiscalPeriodId: invoiceForm.fiscalPeriodId,
      invoiceNo: invoiceForm.invoiceNo,
      lines: [{ description: invoiceForm.description, amount: Number(invoiceForm.amount) }],
      vatRate: 0.15,
    });
    await api.post(`/api/accounting/invoices/${invoice._id}/post`, {});
    reloadInvoices();
  }); };

  const recordReceipt = (e) => { e.preventDefault(); run(async () => {
    await api.post('/api/accounting/settlements', {
      kind: 'receipt',
      partyId: receiptForm.partyId,
      fiscalPeriodId: receiptForm.fiscalPeriodId,
      amount: Number(receiptForm.amount),
      allocations: [{ invoiceId: receiptForm.invoiceId, amountApplied: Number(receiptForm.amount) }],
    });
    reloadInvoices();
  }); };

  const checkBalance = (partyId) => run(async () => {
    setBalance(await api.get(`/api/accounting/parties/${partyId}/balance`));
  });

  const loadReports = (fiscalPeriodId) => run(async () => {
    setTrialBalance(await api.get(`/api/accounting/reports/trial-balance?fiscalPeriodId=${fiscalPeriodId}`));
    setPnl(await api.get(`/api/accounting/reports/profit-and-loss?fiscalPeriodId=${fiscalPeriodId}`));
  });

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>1. Setup</h2>
        <p className="hint">Seed the standard Chart of Accounts once per company before posting anything.</p>
        <button className="secondary" onClick={seedCoa}>Seed Chart of Accounts</button>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Fiscal Period</h2>
          <form className="inline" onSubmit={createPeriod}>
            <label>Name<input required placeholder="2026-01" value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} /></label>
            <label>Start<input required type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} /></label>
            <label>End<input required type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} /></label>
            <button type="submit">Create</button>
          </form>
          <table>
            <thead><tr><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              {(periods || []).map((p) => (
                <tr key={p._id}>
                  <td>{p.name}</td>
                  <td><span className={`pill ${p.status === 'open' ? 'ok' : 'warn'}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Customer</h2>
          <form className="inline" onSubmit={createCustomer}>
            <label>Name<input required value={customerForm.name} onChange={(e) => setCustomerForm({ name: e.target.value })} /></label>
            <button type="submit">Create</button>
          </form>
          <table>
            <thead><tr><th>Name</th><th>Balance</th></tr></thead>
            <tbody>
              {(customers || []).map((c) => (
                <tr key={c._id}>
                  <td>{c.name}</td>
                  <td><button className="secondary" onClick={() => checkBalance(c._id)}>Check</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {balance && <p className="hint">Net Accounts Receivable balance: <strong>{balance.netBalance}</strong></p>}
        </div>
      </div>

      <div className="card">
        <h2>2. Sales Invoice (the worked scenario: SAR 10,000 + 15% VAT)</h2>
        <form className="inline" onSubmit={createAndPostInvoice}>
          <label>Customer
            <select required value={invoiceForm.partyId} onChange={(e) => setInvoiceForm({ ...invoiceForm, partyId: e.target.value })}>
              <option value="">select...</option>
              {(customers || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>
          <label>Period
            <select required value={invoiceForm.fiscalPeriodId} onChange={(e) => setInvoiceForm({ ...invoiceForm, fiscalPeriodId: e.target.value })}>
              <option value="">select...</option>
              {(periods || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </label>
          <label>Invoice No<input required value={invoiceForm.invoiceNo} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNo: e.target.value })} /></label>
          <label>Description<input value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} /></label>
          <label>Amount (excl. VAT)<input required type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} /></label>
          <button type="submit">Create &amp; Post</button>
        </form>

        <table>
          <thead><tr><th>Invoice No</th><th>Subtotal</th><th>VAT</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>
            {(invoices || []).map((i) => (
              <tr key={i._id}>
                <td>{i.invoiceNo}</td>
                <td>{i.subtotal}</td>
                <td>{i.vatAmount}</td>
                <td>{i.total}</td>
                <td>{i.paidAmount}</td>
                <td><span className="pill">{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>3. Receive Payment</h2>
        <form className="inline" onSubmit={recordReceipt}>
          <label>Customer
            <select required value={receiptForm.partyId} onChange={(e) => setReceiptForm({ ...receiptForm, partyId: e.target.value })}>
              <option value="">select...</option>
              {(customers || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>
          <label>Period
            <select required value={receiptForm.fiscalPeriodId} onChange={(e) => setReceiptForm({ ...receiptForm, fiscalPeriodId: e.target.value })}>
              <option value="">select...</option>
              {(periods || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </label>
          <label>Invoice
            <select required value={receiptForm.invoiceId} onChange={(e) => setReceiptForm({ ...receiptForm, invoiceId: e.target.value })}>
              <option value="">select...</option>
              {(invoices || []).filter((i) => i.status === 'posted').map((i) => <option key={i._id} value={i._id}>{i.invoiceNo} (total {i.total})</option>)}
            </select>
          </label>
          <label>Amount<input required type="number" value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })} /></label>
          <button type="submit">Record Receipt</button>
        </form>
      </div>

      <div className="card">
        <h2>4. Reports</h2>
        <form className="inline" onSubmit={(e) => { e.preventDefault(); loadReports(e.target.period.value); }}>
          <label>Period
            <select name="period" required>
              <option value="">select...</option>
              {(periods || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </label>
          <button type="submit">Load Trial Balance &amp; P&amp;L</button>
        </form>

        {trialBalance && (
          <div style={{ marginTop: 12 }}>
            <h3>Trial Balance {trialBalance.isBalanced ? <span className="pill ok">balanced</span> : <span className="pill warn">unbalanced</span>}</h3>
            <table>
              <thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
              <tbody>
                {trialBalance.rows.map((r) => (
                  <tr key={r.accountId}><td>{r.code}</td><td>{r.name}</td><td>{r.totalDebit}</td><td>{r.totalCredit}</td></tr>
                ))}
                <tr><td colSpan={2}><strong>Total</strong></td><td><strong>{trialBalance.totalDebit}</strong></td><td><strong>{trialBalance.totalCredit}</strong></td></tr>
              </tbody>
            </table>
          </div>
        )}
        {pnl && (
          <div style={{ marginTop: 12 }}>
            <h3>Profit &amp; Loss</h3>
            <p>Revenue: <strong>{pnl.totalRevenue}</strong> &middot; Expense: <strong>{pnl.totalExpense}</strong> &middot; Net Income: <strong>{pnl.netIncome}</strong></p>
          </div>
        )}
      </div>
    </div>
  );
}
