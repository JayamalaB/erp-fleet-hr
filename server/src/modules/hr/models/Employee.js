const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

// The central hub (docs 5.1). Salary/allowances/deductions/loans are
// deliberately NOT fields here - each lives in its own effective-dated
// collection so a raise or a new loan never overwrites history.
const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String },
    joinDate: { type: Date, required: true },
    position: { type: String },
    department: { type: String },
    status: { type: String, enum: ['active', 'on_leave', 'terminated'], default: 'active' },
    terminationDate: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

employeeSchema.plugin(tenantScoped);
employeeSchema.plugin(auditable, { entity: 'Employee' });

module.exports = mongoose.model('Employee', employeeSchema);
