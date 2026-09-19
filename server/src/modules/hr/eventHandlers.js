const { subscribe } = require('../../platform/eventBus');
const DriverBonusLine = require('./models/DriverBonusLine');
const PayrollRun = require('./models/PayrollRun');

function periodLabelFor(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * HR/Payroll's ONLY coupling to Fleet (docs 5.7): a subscription to
 * trip.completed. No import of, or query against, Fleet's Trip/Driver
 * collections - if the Fleet module were removed entirely, this handler
 * would simply never fire and HR would keep working unmodified.
 */
subscribe('trip.completed', 'hr-payroll-driver-bonus', async (payload) => {
  // Eligibility (docs 5.5): subcontractor trips, or a driver with no linked
  // employee record, never create an employee payroll bonus.
  if (payload.isSubcontractor || !payload.employeeId) return;

  const completedAt = new Date(payload.completedAt);
  const run = await PayrollRun.findOne({ periodStart: { $lte: completedAt }, periodEnd: { $gte: completedAt } });

  const doc = {
    employeeId: payload.employeeId,
    tripId: payload.tripId,
    amount: payload.amount,
    tripCompletedAt: completedAt,
    payrollPeriodId: null,
    pendingPeriodLabel: null,
  };

  if (run && ['draft', 'calculated'].includes(run.status)) {
    doc.payrollPeriodId = run._id;
  } else {
    // No open run for this date yet, or it's already Locked/Paid - the
    // bonus is never dropped, just deferred to the next open run that
    // covers this label (docs 5.5's "period-assignment layer").
    doc.pendingPeriodLabel = periodLabelFor(completedAt);
  }

  try {
    await DriverBonusLine.create(doc);
  } catch (err) {
    // Unique index on (companyId, tripId) - a redelivered trip.completed
    // event (at-least-once) hits this and is silently treated as already
    // handled, never a second bonus line (docs 5.5/5.9 - "the same trip
    // must never be paid twice").
    if (err.code !== 11000) throw err;
  }
});
