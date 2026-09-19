const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');

// One row per eligible completed trip, created by the trip.completed
// subscriber (docs 5.5/5.7). The unique index on (companyId, tripId) is
// the actual anti-double-pay guarantee - "the same trip must never be paid
// twice" - not just an application-level check, which would still race
// under at-least-once event redelivery.
const driverBonusLineSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    tripId: { type: String, required: true }, // Fleet's Trip._id, stored as an opaque string - no cross-module ref
    amount: { type: Number, required: true, min: 0 },
    payrollPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', default: null },
    // Set instead of payrollPeriodId when the natural period is already
    // Locked/Paid by the time the trip event arrives - the bonus is never
    // dropped, just deferred to the next open run (docs 5.5).
    pendingPeriodLabel: { type: String, default: null },
    tripCompletedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

driverBonusLineSchema.index({ companyId: 1, tripId: 1 }, { unique: true });
driverBonusLineSchema.plugin(tenantScoped);

module.exports = mongoose.model('DriverBonusLine', driverBonusLineSchema);
