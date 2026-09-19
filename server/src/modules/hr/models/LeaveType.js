const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');

const leaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Annual, Sick, Unpaid, Maternity, ...
    accrualDaysPerMonth: { type: Number, default: 0 }, // 0 for types that don't accrue (e.g. Unpaid)
    isPaid: { type: Boolean, default: true },
    maxCarryForwardDays: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

leaveTypeSchema.plugin(tenantScoped);

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
