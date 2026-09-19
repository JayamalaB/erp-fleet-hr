const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

// Effective-dated, same append-only pattern as Fleet's VehicleAssignment
// (docs 5.1) - a raise closes the old row and opens a new one; it never
// overwrites basicSalary in place.
const salaryStructureSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    basicSalary: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

salaryStructureSchema.index(
  { companyId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { effectiveTo: null } }
);
salaryStructureSchema.plugin(tenantScoped);
salaryStructureSchema.plugin(auditable, { entity: 'SalaryStructure' });

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
