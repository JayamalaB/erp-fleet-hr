const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');

const breakdownItemSchema = new mongoose.Schema(
  {
    component: { type: String, required: true }, // 'basic' | 'allowance' | 'overtime' | 'trip_bonus' | 'deduction' | 'loan_installment'
    label: { type: String },
    amount: { type: Number, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId }, // the AllowanceDeduction/Loan/DriverBonusLine row this came from
  },
  { _id: false }
);

// One row per employee per run - the unique index is what makes
// recalculation idempotent (docs 5.9: "prevent duplicate payroll
// calculations"): re-running replaces this row, it never inserts a second.
const payrollLineSchema = new mongoose.Schema(
  {
    payrollRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    basic: { type: Number, required: true },
    allowances: { type: Number, required: true },
    overtime: { type: Number, required: true },
    tripBonuses: { type: Number, required: true },
    deductions: { type: Number, required: true },
    loanInstallments: { type: Number, required: true },
    netSalary: { type: Number, required: true },
    breakdown: { type: [breakdownItemSchema], default: [] },
    supersedesLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollLine', default: null }, // set on a post-lock recalculation
  },
  { timestamps: true, versionKey: false }
);

payrollLineSchema.index({ companyId: 1, payrollRunId: 1, employeeId: 1 }, { unique: true });
payrollLineSchema.plugin(tenantScoped);
// No auditable() here: PayrollLine already carries a full breakdown[] and,
// once Locked, is never overwritten in place (a reopened recalculation
// creates a new line referencing the old via supersedesLineId - docs 5.4).

module.exports = mongoose.model('PayrollLine', payrollLineSchema);
