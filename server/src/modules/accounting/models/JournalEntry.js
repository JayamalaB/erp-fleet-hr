const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');

const journalLineSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null }, // sub-ledger tag for AR/AP lines
  },
  { _id: false }
);

const journalEntrySchema = new mongoose.Schema(
  {
    fiscalPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalPeriod', required: true },
    // sourceType/sourceId trace back to the operational document that
    // caused this entry (the reconciliation key - docs 3.5). The unique
    // index below is the real double-posting guard.
    sourceType: { type: String, required: true }, // 'sales_invoice' | 'purchase_invoice' | 'receipt' | 'payment' | 'manual' | 'reversal'
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    lines: { type: [journalLineSchema], required: true, validate: (v) => v.length >= 2 },
    memo: { type: String },
    postedAt: { type: Date, default: Date.now },
    postedByUserId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, versionKey: false }
);

// The idempotency guarantee behind "prevent double posting" (docs 3.5/2.4):
// one JournalEntry per (company, sourceType, sourceId) pair, at the DB level.
journalEntrySchema.index({ companyId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
journalEntrySchema.plugin(tenantScoped);
// Deliberately NOT auditable() here: JournalEntry is itself an immutable
// financial record and the source-of-truth ledger - it is never updated in
// place (see invoiceService.cancelInvoice's reversal pattern), so a
// separate audit trail on top of it would just duplicate its own rows.

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
