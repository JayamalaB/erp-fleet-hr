const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    amountApplied: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// A "Settlement" is a Receipt (kind='receipt', from a customer) or a
// Payment (kind='payment', to a supplier) - same shape, same posting logic,
// mirroring the sales/purchase split on Invoice.
const settlementSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['receipt', 'payment'], required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    fiscalPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalPeriod', required: true },
    amount: { type: Number, required: true, min: 0 },
    allocations: { type: [allocationSchema], default: [] }, // sum(allocations) <= amount; unallocated = unapplied cash
    method: { type: String, enum: ['cash', 'bank_transfer', 'card', 'cheque'], default: 'cash' },
    receivedOrPaidAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['draft', 'posted', 'cancelled'], default: 'draft' },
  },
  { timestamps: true, versionKey: false }
);

settlementSchema.plugin(tenantScoped);
settlementSchema.plugin(auditable, { entity: 'Settlement' });

module.exports = mongoose.model('Settlement', settlementSchema);
