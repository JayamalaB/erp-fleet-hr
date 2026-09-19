const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

// Generated once at termination; immutable after generation (docs 5.8).
const endOfServiceRecordSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
    terminationDate: { type: Date, required: true },
    terminationType: { type: String, enum: ['resignation', 'termination'], required: true },
    yearsOfService: { type: Number, required: true },
    lastBasicSalary: { type: Number, required: true },
    eosAmount: { type: Number, required: true },
    remainingLeaveDays: { type: Number, required: true },
    remainingLeavePayout: { type: Number, required: true },
    breakdown: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, versionKey: false }
);

endOfServiceRecordSchema.plugin(tenantScoped);
endOfServiceRecordSchema.plugin(auditable, { entity: 'EndOfServiceRecord' });

module.exports = mongoose.model('EndOfServiceRecord', endOfServiceRecordSchema);
