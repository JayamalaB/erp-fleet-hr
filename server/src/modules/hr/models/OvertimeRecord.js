const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const overtimeRecordSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true },
    hours: { type: Number, required: true, min: 0 },
    rateMultiplier: { type: Number, default: 1.5 },
    // No payrollPeriodId field: overtime is scoped to a payroll period by
    // its own `date` falling inside [periodStart, periodEnd] at
    // calculation time (payrollService.js), not by a separately-assigned
    // flag - there is no cross-module event that could double-consume it.
  },
  { timestamps: true, versionKey: false }
);

overtimeRecordSchema.plugin(tenantScoped);
overtimeRecordSchema.plugin(auditable, { entity: 'OvertimeRecord' });

module.exports = mongoose.model('OvertimeRecord', overtimeRecordSchema);
