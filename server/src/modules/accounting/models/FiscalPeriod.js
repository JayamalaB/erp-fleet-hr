const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const fiscalPeriodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "2026-01"
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['open', 'closed', 'locked'], default: 'open' },
  },
  { timestamps: true, versionKey: false }
);

fiscalPeriodSchema.index({ companyId: 1, name: 1 }, { unique: true });
fiscalPeriodSchema.plugin(tenantScoped);
fiscalPeriodSchema.plugin(auditable, { entity: 'FiscalPeriod' });

module.exports = mongoose.model('FiscalPeriod', fiscalPeriodSchema);
