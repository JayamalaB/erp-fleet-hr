const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Party = require('../models/Party');
const { postJournalEntry, round2 } = require('./journalService');
const { getSystemAccount, SYSTEM_ACCOUNT_CODES } = require('./coaService');
const { publish } = require('../../../platform/eventBus');
const { NotFoundError, ConflictError, ValidationError } = require('../../../platform/errors');
const { getCurrentCompanyId } = require('../../../platform/tenantContext');

function computeTotals(lines, vatRate) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const vatAmount = round2(subtotal * vatRate);
  const total = round2(subtotal + vatAmount);
  return { subtotal, vatAmount, total };
}

async function createInvoice({ kind, partyId, fiscalPeriodId, invoiceNo, lines, vatRate }) {
  const party = await Party.findById(partyId);
  if (!party) throw new NotFoundError('Customer/Supplier not found');
  const expectedKind = kind === 'sales' ? 'customer' : 'supplier';
  if (party.kind !== expectedKind) {
    throw new ValidationError(`A ${kind} invoice requires a ${expectedKind} party`);
  }
  const { subtotal, vatAmount, total } = computeTotals(lines, vatRate);
  const invoice = await Invoice.create({
    kind,
    partyId,
    fiscalPeriodId,
    invoiceNo,
    lines,
    vatRate,
    subtotal,
    vatAmount,
    total,
    status: 'draft',
  });
  return invoice;
}

/**
 * Draft -> Posted. Generates exactly one balanced JournalEntry (docs 3.3):
 *   sales:    Dr AR total           | Cr Revenue subtotal, Cr VAT Payable vat
 *   purchase: Dr Expense subtotal, Dr VAT Receivable vat | Cr AP total
 * Runs the invoice-status flip, the journal posting, and the outbox event
 * publish inside one Mongo transaction - all-or-nothing (docs 2.4).
 */
async function postInvoice(invoiceId, { postedByUserId } = {}) {
  const companyId = getCurrentCompanyId();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (invoice.status !== 'draft') {
        throw new ConflictError(`Invoice is already ${invoice.status} - cannot post again`);
      }

      const arAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, session);
      const apAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE, session);
      const vatOutAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.VAT_OUTPUT_PAYABLE, session);
      const vatInAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.VAT_INPUT_RECEIVABLE, session);
      const revenueAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.SERVICE_REVENUE, session);
      const expenseAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE, session);

      const lines =
        invoice.kind === 'sales'
          ? [
              { accountId: arAccount._id, debit: invoice.total, credit: 0, partyId: invoice.partyId },
              { accountId: revenueAccount._id, debit: 0, credit: invoice.subtotal },
              { accountId: vatOutAccount._id, debit: 0, credit: invoice.vatAmount },
            ]
          : [
              { accountId: expenseAccount._id, debit: invoice.subtotal, credit: 0 },
              { accountId: vatInAccount._id, debit: invoice.vatAmount, credit: 0 },
              { accountId: apAccount._id, debit: 0, credit: invoice.total, partyId: invoice.partyId },
            ];

      await postJournalEntry({
        fiscalPeriodId: invoice.fiscalPeriodId,
        sourceType: invoice.kind === 'sales' ? 'sales_invoice' : 'purchase_invoice',
        sourceId: invoice._id,
        lines,
        memo: `${invoice.kind === 'sales' ? 'Sales' : 'Purchase'} invoice ${invoice.invoiceNo}`,
        postedByUserId,
        session,
      });

      invoice.status = 'posted';
      invoice.postedAt = new Date();
      invoice.$locals.actorUserId = postedByUserId;
      await invoice.save({ session });

      await publish(
        'invoice.posted',
        companyId,
        { invoiceId: String(invoice._id), companyId: String(companyId), partyId: String(invoice.partyId), total: invoice.total, vatAmount: invoice.vatAmount },
        session
      );

      result = invoice;
    });
    return result;
  } finally {
    session.endSession();
  }
}

/**
 * Posted -> Cancelled. Never mutates or deletes the original JournalEntry
 * (immutability of posted financial records - docs 3.5): instead posts a
 * mirrored reversing entry referencing the invoice via sourceType='reversal'.
 * Net ledger effect across both entries is zero; full history stays visible.
 */
async function cancelInvoice(invoiceId, { actorUserId } = {}) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (invoice.status !== 'posted') {
        throw new ConflictError('Only a posted invoice can be cancelled');
      }

      const JournalEntry = require('../models/JournalEntry');
      const originalEntry = await JournalEntry.findOne({
        sourceType: invoice.kind === 'sales' ? 'sales_invoice' : 'purchase_invoice',
        sourceId: invoice._id,
      }).session(session);
      if (!originalEntry) throw new NotFoundError('Original journal entry not found for this invoice');

      const reversedLines = originalEntry.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.credit,
        credit: l.debit,
        partyId: l.partyId,
      }));

      await postJournalEntry({
        fiscalPeriodId: invoice.fiscalPeriodId,
        sourceType: 'reversal',
        sourceId: invoice._id,
        lines: reversedLines,
        memo: `Reversal of ${invoice.kind} invoice ${invoice.invoiceNo}`,
        postedByUserId: actorUserId,
        session,
      });

      invoice.status = 'cancelled';
      invoice.$locals.actorUserId = actorUserId;
      await invoice.save({ session });
      result = invoice;
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { createInvoice, postInvoice, cancelInvoice, computeTotals };
