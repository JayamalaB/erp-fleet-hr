const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');

// Balance = sum(accrual) - sum(consumption) - sum(expiry) + sum(carry_forward),
// always a live query over this ledger (docs 5.6) - never a cached counter
// that could drift. Every entry is append-only and explains itself
// ("why did my balance drop on Jan 1" is always answerable from history).
const leaveLedgerEntrySchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    kind: { type: String, enum: ['accrual', 'consumption', 'carry_forward', 'expiry', 'payout'], required: true },
    days: { type: Number, required: true }, // positive for accrual/carry_forward, negative for consumption/expiry/payout
    date: { type: Date, required: true, default: Date.now },
    note: { type: String },
  },
  { timestamps: true, versionKey: false }
);

leaveLedgerEntrySchema.plugin(tenantScoped);

module.exports = mongoose.model('LeaveLedgerEntry', leaveLedgerEntrySchema);
