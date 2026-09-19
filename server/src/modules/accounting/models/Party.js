const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

// Customer and Supplier share the same shape; modeled as one schema with a
// `kind` discriminator rather than two near-identical collections.
const partySchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['customer', 'supplier'], required: true },
    name: { type: String, required: true, trim: true },
    taxNo: { type: String },
    paymentTermsDays: { type: Number, default: 30 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

partySchema.index({ companyId: 1, kind: 1, name: 1 });
partySchema.plugin(tenantScoped);
partySchema.plugin(auditable, { entity: 'Party' });

module.exports = mongoose.model('Party', partySchema);
