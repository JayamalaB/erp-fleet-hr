const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Intentionally NOT a `ref` into the HR module - just an opaque id Fleet
    // stores and never joins against for business logic (docs 4.5/4.7).
    // Null means the driver is a subcontractor with no HR employee record.
    employeeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isSubcontractor: { type: Boolean, default: false },
    licenseNo: { type: String, required: true },
    licenseExpiry: { type: Date },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, versionKey: false }
);

driverSchema.plugin(tenantScoped);
driverSchema.plugin(auditable, { entity: 'Driver' });

module.exports = mongoose.model('Driver', driverSchema);
