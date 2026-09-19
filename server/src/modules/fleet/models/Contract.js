const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

// A minimal, Fleet-owned notion of "customer contract" for trip pricing.
// Deliberately NOT a reference into Accounting's Party/Customer collection:
// Fleet stays independent of Accounting (docs 4.5/6) and only exposes an
// opaque customerRef string/id that Accounting can later resolve to its
// own Customer when drafting an invoice from a completed trip.
const contractSchema = new mongoose.Schema(
  {
    customerRef: { type: String, required: true }, // free-form customer name/id, not a foreign key
    rateType: { type: String, enum: ['flat', 'per_km'], required: true },
    rateValue: { type: Number, required: true }, // flat amount, or SAR per km
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

contractSchema.plugin(tenantScoped);
contractSchema.plugin(auditable, { entity: 'Contract' });

module.exports = mongoose.model('Contract', contractSchema);
