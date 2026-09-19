const LeaveLedgerEntry = require('../models/LeaveLedgerEntry');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveType = require('../models/LeaveType');
const { NotFoundError, ValidationError, ConflictError } = require('../../../platform/errors');

/** Live query over the ledger (docs 5.6) - never a cached counter. */
async function getLeaveBalance(employeeId, leaveTypeId) {
  const rows = await LeaveLedgerEntry.find({ employeeId, leaveTypeId });
  return rows.reduce((sum, r) => sum + r.days, 0);
}

const ADVANCE_LEAVE_LIMIT_DAYS = 5; // configurable per company/leave-type in a fuller build

/**
 * Monthly accrual job (docs 5.6 - "accrual based on joining date"): for
 * every active employee whose joining-date anniversary day is "today" (or
 * simply run once a month per employee in this simplified version), post
 * one accrual ledger entry per leave type that accrues. Idempotent per
 * (employee, leaveType, month) via a natural note-based dedupe check.
 */
async function accrueMonthlyLeave(employeeId, leaveTypeId, periodLabel) {
  const leaveType = await LeaveType.findById(leaveTypeId);
  if (!leaveType || leaveType.accrualDaysPerMonth <= 0) return null;

  const note = `monthly-accrual:${periodLabel}`;
  const existing = await LeaveLedgerEntry.findOne({ employeeId, leaveTypeId, note });
  if (existing) return existing; // already accrued for this period - idempotent

  return LeaveLedgerEntry.create({
    employeeId,
    leaveTypeId,
    kind: 'accrual',
    days: leaveType.accrualDaysPerMonth,
    note,
  });
}

async function requestLeave({ employeeId, leaveTypeId, from, to, days }) {
  const leaveType = await LeaveType.findById(leaveTypeId);
  if (!leaveType) throw new NotFoundError('Leave type not found');

  if (leaveType.isPaid) {
    const balance = await getLeaveBalance(employeeId, leaveTypeId);
    if (balance - days < -ADVANCE_LEAVE_LIMIT_DAYS) {
      throw new ValidationError(
        `Requesting ${days} days would exceed the advance-leave limit (current balance: ${balance}, limit: -${ADVANCE_LEAVE_LIMIT_DAYS})`
      );
    }
  }

  return LeaveRequest.create({ employeeId, leaveTypeId, from, to, days, status: 'pending' });
}

async function approveLeave(leaveRequestId) {
  const request = await LeaveRequest.findById(leaveRequestId);
  if (!request) throw new NotFoundError('Leave request not found');
  if (request.status !== 'pending') throw new ConflictError(`Leave request is already ${request.status}`);

  request.status = 'approved';
  await request.save();

  const leaveType = await LeaveType.findById(request.leaveTypeId);
  if (leaveType.isPaid) {
    // Paid leave consumes the accrued balance ledger.
    await LeaveLedgerEntry.create({
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      kind: 'consumption',
      days: -request.days,
      note: `leave-request:${request._id}`,
    });
  }
  // Unpaid leave does NOT touch the balance ledger (docs 5.6) - its payroll
  // effect is applied directly as a deduction line in calculatePayrollLine.
  return request;
}

/**
 * Year-boundary carry-forward job (docs 5.6): caps the rolling balance at
 * maxCarryForwardDays and expires the rest, both as explicit ledger
 * entries so a balance change is always traceable to history.
 */
async function applyCarryForward(employeeId, leaveTypeId) {
  const leaveType = await LeaveType.findById(leaveTypeId);
  if (!leaveType) throw new NotFoundError('Leave type not found');
  const balance = await getLeaveBalance(employeeId, leaveTypeId);
  const carried = Math.min(balance, leaveType.maxCarryForwardDays);
  const expired = Math.max(balance - leaveType.maxCarryForwardDays, 0);

  // Only the expiry needs a ledger entry - the carried portion already IS
  // the remaining balance, so recording it again would double-count it.
  if (expired > 0) {
    await LeaveLedgerEntry.create({ employeeId, leaveTypeId, kind: 'expiry', days: -expired, note: 'year-end-expiry' });
  }
  return { carried, expired };
}

module.exports = { getLeaveBalance, accrueMonthlyLeave, requestLeave, approveLeave, applyCarryForward };
