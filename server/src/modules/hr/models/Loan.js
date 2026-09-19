const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const loanSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    principal: { type: Number, required: true, min: 0 },
    installmentAmount: { type: Number, required: true, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    startPeriod: { type: String, required: true }, // e.g. "2026-01"
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
  },
  { timestamps: true, versionKey: false }
);

loanSchema.plugin(tenantScoped);
loanSchema.plugin(auditable, { entity: 'Loan' });

module.exports = mongoose.model('Loan', loanSchema);
