const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const allowanceDeductionSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    kind: { type: String, enum: ['allowance', 'deduction'], required: true },
    label: { type: String, required: true }, // e.g. "Housing Allowance", "Uniform Deduction"
    amount: { type: Number, required: true, min: 0 },
    isRecurring: { type: Boolean, default: true },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

allowanceDeductionSchema.plugin(tenantScoped);
allowanceDeductionSchema.plugin(auditable, { entity: 'AllowanceDeduction' });

module.exports = mongoose.model('AllowanceDeduction', allowanceDeductionSchema);
