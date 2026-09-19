const PayrollRun = require('../models/PayrollRun');
const PayrollLine = require('../models/PayrollLine');
const SalaryStructure = require('../models/SalaryStructure');
const AllowanceDeduction = require('../models/AllowanceDeduction');
const Loan = require('../models/Loan');
const OvertimeRecord = require('../models/OvertimeRecord');
const DriverBonusLine = require('../models/DriverBonusLine');
const Employee = require('../models/Employee');
const { NotFoundError, ConflictError } = require('../../../platform/errors');

const HOURS_PER_MONTH = 240; // 30 days x 8 hours - the simplified standard used to derive an hourly rate from basic

function round2(n) {
  return Math.round(n * 100) / 100;
}

function overlapDays(aStart, aEnd, bStart, bEnd) {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  const ms = end - start;
  return ms > 0 ? ms / (1000 * 60 * 60 * 24) + 1 : 0;
}

/**
 * The single function every net-salary number in this module comes from
 * (docs 5.2/5.3): Net = Basic + Allowances + Overtime + Trip Bonuses -
 * Deductions - Loan Installments. Every summand is re-read from its own
 * source collection at call time (never cached), and recorded in
 * breakdown[] with a sourceId, so the result is auditable line-by-line.
 */
async function calculatePayrollLine(employeeId, payrollRunId) {
  const run = await PayrollRun.findById(payrollRunId);
  if (!run) throw new NotFoundError('Payroll run not found');
  if (!['draft', 'calculated'].includes(run.status)) {
    throw new ConflictError(`Payroll run is ${run.status} - reopen it before recalculating`);
  }
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new NotFoundError('Employee not found');

  const periodStart = run.periodStart;
  const periodEnd = run.periodEnd;
  const totalDaysInPeriod = overlapDays(periodStart, periodEnd, periodStart, periodEnd);

  const breakdown = [];

  // ---- Basic salary: resolved by effective-date window, prorated for a
  // mid-period join/termination (docs 5.9 - no special-cased mid-month logic).
  const salaryStructure = await SalaryStructure.findOne({
    employeeId,
    effectiveFrom: { $lte: periodEnd },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: periodStart } }],
  }).sort({ effectiveFrom: -1 });

  let basic = 0;
  if (salaryStructure) {
    const effectiveEnd = salaryStructure.effectiveTo || periodEnd;
    const daysWorked = overlapDays(salaryStructure.effectiveFrom, effectiveEnd, periodStart, periodEnd);
    const fraction = Math.min(daysWorked / totalDaysInPeriod, 1);
    basic = round2(salaryStructure.basicSalary * fraction);
    breakdown.push({ component: 'basic', label: 'Basic Salary', amount: basic, sourceId: salaryStructure._id });
  }

  // ---- Allowances (prorated the same way as basic) / Deductions (fixed).
  const allowanceDeductions = await AllowanceDeduction.find({
    employeeId,
    effectiveFrom: { $lte: periodEnd },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: periodStart } }],
  });

  let allowances = 0;
  let deductions = 0;
  for (const ad of allowanceDeductions) {
    if (ad.kind === 'allowance') {
      const effectiveEnd = ad.effectiveTo || periodEnd;
      const daysActive = overlapDays(ad.effectiveFrom, effectiveEnd, periodStart, periodEnd);
      const fraction = Math.min(daysActive / totalDaysInPeriod, 1);
      const amount = round2(ad.amount * fraction);
      allowances = round2(allowances + amount);
      breakdown.push({ component: 'allowance', label: ad.label, amount, sourceId: ad._id });
    } else {
      deductions = round2(deductions + ad.amount);
      breakdown.push({ component: 'deduction', label: ad.label, amount: ad.amount, sourceId: ad._id });
    }
  }

  // ---- Overtime: scoped to the period by date, not by a separate flag.
  const overtimeRecords = await OvertimeRecord.find({ employeeId, date: { $gte: periodStart, $lte: periodEnd } });
  const hourlyRate = basic > 0 ? basic / HOURS_PER_MONTH : (salaryStructure ? salaryStructure.basicSalary / HOURS_PER_MONTH : 0);
  let overtime = 0;
  for (const ot of overtimeRecords) {
    const amount = round2(ot.hours * ot.rateMultiplier * hourlyRate);
    overtime = round2(overtime + amount);
    breakdown.push({ component: 'overtime', label: `Overtime ${ot.hours}h`, amount, sourceId: ot._id });
  }

  // ---- Driver trip bonuses: only rows already tagged to THIS run (docs
  // 5.5/5.7) - the payroll engine never reaches into Fleet itself.
  const bonusLines = await DriverBonusLine.find({ employeeId, payrollPeriodId: run._id });
  let tripBonuses = 0;
  for (const b of bonusLines) {
    tripBonuses = round2(tripBonuses + b.amount);
    breakdown.push({ component: 'trip_bonus', label: `Trip bonus (trip ${b.tripId})`, amount: b.amount, sourceId: b._id });
  }

  // ---- Loan installments, capped at the remaining balance.
  const loans = await Loan.find({ employeeId, status: 'active', remainingBalance: { $gt: 0 } });
  let loanInstallments = 0;
  for (const loan of loans) {
    const installment = Math.min(loan.installmentAmount, loan.remainingBalance);
    loanInstallments = round2(loanInstallments + installment);
    breakdown.push({ component: 'loan_installment', label: 'Loan installment', amount: installment, sourceId: loan._id });
  }

  const netSalary = round2(basic + allowances + overtime + tripBonuses - deductions - loanInstallments);

  const line = await PayrollLine.findOneAndUpdate(
    { payrollRunId: run._id, employeeId },
    { basic, allowances, overtime, tripBonuses, deductions, loanInstallments, netSalary, breakdown },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return line;
}

async function calculatePayrollForAllEmployees(payrollRunId) {
  const employees = await Employee.find({ status: { $ne: 'terminated' } });
  const lines = [];
  for (const emp of employees) {
    lines.push(await calculatePayrollLine(emp._id, payrollRunId));
  }
  const run = await PayrollRun.findById(payrollRunId);
  run.status = 'calculated';
  await run.save();
  return lines;
}

const VALID_RUN_TRANSITIONS = {
  draft: ['calculated'],
  calculated: ['locked', 'draft'],
  locked: ['paid', 'calculated'], // 'calculated' here = an explicit reopen, audit-logged
  paid: [],
};

async function transitionPayrollRun(payrollRunId, targetStatus) {
  const run = await PayrollRun.findById(payrollRunId);
  if (!run) throw new NotFoundError('Payroll run not found');
  const allowed = VALID_RUN_TRANSITIONS[run.status] || [];
  if (!allowed.includes(targetStatus)) {
    throw new ConflictError(`Cannot move payroll run from '${run.status}' to '${targetStatus}'`);
  }
  run.status = targetStatus;
  if (targetStatus === 'locked') run.lockedAt = new Date();
  await run.save();
  return run;
}

/** Loan installment application: called once a payroll run is Locked (docs 5.2). */
async function applyLoanInstallments(payrollRunId) {
  const lines = await PayrollLine.find({ payrollRunId });
  for (const line of lines) {
    for (const item of line.breakdown.filter((b) => b.component === 'loan_installment')) {
      const loan = await Loan.findById(item.sourceId);
      if (!loan) continue;
      loan.remainingBalance = round2(loan.remainingBalance - item.amount);
      if (loan.remainingBalance <= 0) loan.status = 'closed';
      await loan.save();
    }
  }
}

module.exports = {
  calculatePayrollLine,
  calculatePayrollForAllEmployees,
  transitionPayrollRun,
  applyLoanInstallments,
  round2,
};
