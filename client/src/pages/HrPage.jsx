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

export default function HrPage() {
  const [error, setError] = useState('');
  const [employees, , reloadEmployees] = useLoader(() => api.get('/api/hr/employees'), []);
  const [runs, , reloadRuns] = useLoader(() => api.get('/api/hr/payroll-runs'), []);

  const [employeeForm, setEmployeeForm] = useState({ name: '', joinDate: '' });
  const [salaryForm, setSalaryForm] = useState({ employeeId: '', basicSalary: 5000, effectiveFrom: '' });
  const [adForm, setAdForm] = useState({ employeeId: '', kind: 'allowance', label: 'Monthly Allowance', amount: 500, effectiveFrom: '' });
  const [loanForm, setLoanForm] = useState({ employeeId: '', principal: 2000, installmentAmount: 500, startPeriod: '' });
  const [runForm, setRunForm] = useState({ periodLabel: '', periodStart: '', periodEnd: '' });
  const [terminationForm, setTerminationForm] = useState({ employeeId: '', terminationDate: '', terminationType: 'termination' });
  const [lines, setLines] = useState(null);
  const [activeRunId, setActiveRunId] = useState(null);
  const [eosResult, setEosResult] = useState(null);

  async function run(fn) {
    setError('');
    try { await fn(); } catch (e) { setError(e.message); }
  }

  const createEmployee = (e) => { e.preventDefault(); run(async () => { await api.post('/api/hr/employees', employeeForm); reloadEmployees(); }); };
  const setSalary = (e) => { e.preventDefault(); run(async () => { await api.post('/api/hr/salary', { ...salaryForm, basicSalary: Number(salaryForm.basicSalary) }); }); };
  const addAllowanceDeduction = (e) => { e.preventDefault(); run(async () => { await api.post('/api/hr/allowance-deductions', { ...adForm, amount: Number(adForm.amount) }); }); };
  const addLoan = (e) => { e.preventDefault(); run(async () => { await api.post('/api/hr/loans', { ...loanForm, principal: Number(loanForm.principal), installmentAmount: Number(loanForm.installmentAmount) }); }); };
  const createRun = (e) => { e.preventDefault(); run(async () => { await api.post('/api/hr/payroll-runs', runForm); reloadRuns(); }); };
  const terminate = (e) => { e.preventDefault(); run(async () => { setEosResult(await api.post('/api/hr/terminations', terminationForm)); reloadEmployees(); }); };

  const calculateRun = (runId) => run(async () => {
    await api.post(`/api/hr/payroll-runs/${runId}/calculate`, {});
    setActiveRunId(runId);
    setLines(await api.get(`/api/hr/payroll-runs/${runId}/lines`));
  });
  const lockRun = (runId) => run(async () => { await api.post(`/api/hr/payroll-runs/${runId}/lock`, {}); reloadRuns(); });

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="grid">
        <div className="card">
          <h2>Employee</h2>
          <form className="inline" onSubmit={createEmployee}>
            <label>Name<input required value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></label>
            <label>Join Date<input required type="date" value={employeeForm.joinDate} onChange={(e) => setEmployeeForm({ ...employeeForm, joinDate: e.target.value })} /></label>
            <button type="submit">Create</button>
          </form>
          <table>
            <thead><tr><th>Name</th><th>Status</th></tr></thead>
            <tbody>{(employees || []).map((e) => <tr key={e._id}><td>{e.name}</td><td><span className="pill">{e.status}</span></td></tr>)}</tbody>
          </table>
        </div>

        <div className="card">
          <h2>Salary / Allowance / Deduction / Loan</h2>
          <form className="inline" onSubmit={setSalary}>
            <label>Employee
              <select required value={salaryForm.employeeId} onChange={(e) => setSalaryForm({ ...salaryForm, employeeId: e.target.value })}>
                <option value="">select...</option>
                {(employees || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </select>
            </label>
            <label>Basic Salary<input required type="number" value={salaryForm.basicSalary} onChange={(e) => setSalaryForm({ ...salaryForm, basicSalary: e.target.value })} /></label>
            <label>Effective From<input type="date" value={salaryForm.effectiveFrom} onChange={(e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value })} /></label>
            <button type="submit">Set Salary</button>
          </form>

          <form className="inline" onSubmit={addAllowanceDeduction} style={{ marginTop: 10 }}>
            <label>Employee
              <select required value={adForm.employeeId} onChange={(e) => setAdForm({ ...adForm, employeeId: e.target.value })}>
                <option value="">select...</option>
                {(employees || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </select>
            </label>
            <label>Kind
              <select value={adForm.kind} onChange={(e) => setAdForm({ ...adForm, kind: e.target.value })}>
                <option value="allowance">allowance</option>
                <option value="deduction">deduction</option>
              </select>
            </label>
            <label>Label<input required value={adForm.label} onChange={(e) => setAdForm({ ...adForm, label: e.target.value })} /></label>
            <label>Amount<input required type="number" value={adForm.amount} onChange={(e) => setAdForm({ ...adForm, amount: e.target.value })} /></label>
            <label>Effective From<input type="date" value={adForm.effectiveFrom} onChange={(e) => setAdForm({ ...adForm, effectiveFrom: e.target.value })} /></label>
            <button type="submit">Add</button>
          </form>

          <form className="inline" onSubmit={addLoan} style={{ marginTop: 10 }}>
            <label>Employee
              <select required value={loanForm.employeeId} onChange={(e) => setLoanForm({ ...loanForm, employeeId: e.target.value })}>
                <option value="">select...</option>
                {(employees || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </select>
            </label>
            <label>Principal<input required type="number" value={loanForm.principal} onChange={(e) => setLoanForm({ ...loanForm, principal: e.target.value })} /></label>
            <label>Installment<input required type="number" value={loanForm.installmentAmount} onChange={(e) => setLoanForm({ ...loanForm, installmentAmount: e.target.value })} /></label>
            <label>Start Period<input required placeholder="2026-01" value={loanForm.startPeriod} onChange={(e) => setLoanForm({ ...loanForm, startPeriod: e.target.value })} /></label>
            <button type="submit">Add Loan</button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2>Payroll Run</h2>
        <form className="inline" onSubmit={createRun}>
          <label>Period Label<input required placeholder="2026-01" value={runForm.periodLabel} onChange={(e) => setRunForm({ ...runForm, periodLabel: e.target.value })} /></label>
          <label>Start<input required type="date" value={runForm.periodStart} onChange={(e) => setRunForm({ ...runForm, periodStart: e.target.value })} /></label>
          <label>End<input required type="date" value={runForm.periodEnd} onChange={(e) => setRunForm({ ...runForm, periodEnd: e.target.value })} /></label>
          <button type="submit">Create</button>
        </form>
        <table>
          <thead><tr><th>Period</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(runs || []).map((r) => (
              <tr key={r._id}>
                <td>{r.periodLabel}</td>
                <td><span className="pill">{r.status}</span></td>
                <td>
                  <button className="secondary" onClick={() => calculateRun(r._id)}>Calculate</button>{' '}
                  <button className="secondary" onClick={() => lockRun(r._id)}>Lock</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {lines && activeRunId && (
          <div style={{ marginTop: 12 }}>
            <h3>Payroll Lines</h3>
            <table>
              <thead><tr><th>Basic</th><th>Allowances</th><th>Overtime</th><th>Trip Bonuses</th><th>Deductions</th><th>Loan</th><th>Net</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l._id}>
                    <td>{l.basic}</td><td>{l.allowances}</td><td>{l.overtime}</td><td>{l.tripBonuses}</td>
                    <td>{l.deductions}</td><td>{l.loanInstallments}</td><td><strong>{l.netSalary}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Termination</h2>
        <form className="inline" onSubmit={terminate}>
          <label>Employee
            <select required value={terminationForm.employeeId} onChange={(e) => setTerminationForm({ ...terminationForm, employeeId: e.target.value })}>
              <option value="">select...</option>
              {(employees || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </label>
          <label>Date<input required type="date" value={terminationForm.terminationDate} onChange={(e) => setTerminationForm({ ...terminationForm, terminationDate: e.target.value })} /></label>
          <label>Type
            <select value={terminationForm.terminationType} onChange={(e) => setTerminationForm({ ...terminationForm, terminationType: e.target.value })}>
              <option value="termination">termination</option>
              <option value="resignation">resignation</option>
            </select>
          </label>
          <button type="submit">Terminate &amp; Compute EOS</button>
        </form>
        {eosResult && (
          <p className="hint">
            Years of service: <strong>{eosResult.yearsOfService}</strong> &middot; EOS amount: <strong>{eosResult.eosAmount}</strong> &middot;
            Remaining leave payout: <strong>{eosResult.remainingLeavePayout}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
