const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const invoiceLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Sales and Purchase invoices share this schema via `kind`, mirroring
// Party.js - the accounting logic (VAT calc, posting, cancellation) is
// identical either way; only which control account and party type it
// touches differs (see invoiceService.js).
const invoiceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['sales', 'purchase'], required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    fiscalPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalPeriod', required: true },
    invoiceNo: { type: String, required: true },
    lines: { type: [invoiceLineSchema], required: true, validate: (v) => v.length > 0 },
    vatRate: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    vatAmount: { type: Number, required: true },
    total: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'posted', 'cancelled'], default: 'draft' },
    postedAt: { type: Date },
    // Optional traceability hook for a future Fleet integration
    // (trip.completed -> auto-drafted SalesInvoice) without Accounting
    // ever importing Fleet's models - see docs Section 6.
    sourceRef: {
      sourceType: { type: String },
      sourceId: { type: mongoose.Schema.Types.ObjectId },
    },
  },
  { timestamps: true, versionKey: false }
);

invoiceSchema.index({ companyId: 1, kind: 1, invoiceNo: 1 }, { unique: true });
invoiceSchema.plugin(tenantScoped);
invoiceSchema.plugin(auditable, { entity: 'Invoice' });

// Payment progress is derived from paidAmount vs total, never a separately
// hand-maintained field - it cannot drift from the settlements that fund it.
invoiceSchema.virtual('paymentStatus').get(function paymentStatus() {
  if (this.status !== 'posted') return null;
  if (this.paidAmount <= 0) return 'unpaid';
  if (this.paidAmount < this.total) return 'partially_paid';
  return 'paid';
});
invoiceSchema.set('toObject', { virtuals: true });
invoiceSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
