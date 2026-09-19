const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

// Mirrors Accounting's FiscalPeriod state machine (docs 3.4/5.4) for
// consistency: Draft -> Calculated -> Locked -> Paid.
const payrollRunSchema = new mongoose.Schema(
  {
    periodLabel: { type: String, required: true }, // e.g. "2026-01"
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'calculated', 'locked', 'paid'], default: 'draft' },
    lockedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

payrollRunSchema.index({ companyId: 1, periodLabel: 1 }, { unique: true });
payrollRunSchema.plugin(tenantScoped);
payrollRunSchema.plugin(auditable, { entity: 'PayrollRun' });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
