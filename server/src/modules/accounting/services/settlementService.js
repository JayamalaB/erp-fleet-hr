const mongoose = require('mongoose');
const Settlement = require('../models/Settlement');
const Invoice = require('../models/Invoice');
const { postJournalEntry, round2 } = require('./journalService');
const { getSystemAccount, SYSTEM_ACCOUNT_CODES } = require('./coaService');
const { ValidationError, NotFoundError, ConflictError } = require('../../../platform/errors');

/**
 * Records a Receipt (kind='receipt', from a Customer) or a Payment
 * (kind='payment', to a Supplier) and immediately posts it.
 *
 * Simplification made explicit (this is core-functionality scope, not a
 * full production build - see docs intro): allocations must fully cover
 * `amount` (sum(allocations.amountApplied) === amount). Unapplied/on-account
 * cash would in a full build sit in an "Unapplied Receipts" sub-ledger
 * until matched to a later invoice; that extra account and matching UI is
 * the natural next increment on top of this same postJournalEntry path.
 */
async function createAndPostSettlement({ kind, partyId, fiscalPeriodId, amount, allocations, method, actorUserId }) {
  if (!allocations || allocations.length === 0) {
    throw new ValidationError('At least one invoice allocation is required');
  }
  const allocatedTotal = round2(allocations.reduce((sum, a) => sum + a.amountApplied, 0));
  if (Math.abs(allocatedTotal - round2(amount)) > 0.005) {
    throw new ValidationError(`Allocations (${allocatedTotal}) must sum exactly to the settlement amount (${amount})`);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const expectedInvoiceKind = kind === 'receipt' ? 'sales' : 'purchase';
      const invoices = [];
      for (const alloc of allocations) {
        const invoice = await Invoice.findById(alloc.invoiceId).session(session);
        if (!invoice) throw new NotFoundError(`Invoice ${alloc.invoiceId} not found`);
        if (String(invoice.partyId) !== String(partyId)) {
          throw new ValidationError('All allocated invoices must belong to the settling party');
        }
        if (invoice.kind !== expectedInvoiceKind) {
          throw new ValidationError(`A ${kind} cannot be allocated to a ${invoice.kind} invoice`);
        }
        if (invoice.status !== 'posted') {
          throw new ConflictError(`Invoice ${invoice.invoiceNo} must be posted before it can be settled`);
        }
        const remaining = round2(invoice.total - invoice.paidAmount);
        if (alloc.amountApplied > remaining + 0.005) {
          throw new ValidationError(
            `Allocation of ${alloc.amountApplied} exceeds invoice ${invoice.invoiceNo}'s remaining balance of ${remaining}`
          );
        }
        invoices.push({ invoice, amountApplied: alloc.amountApplied });
      }

      const [settlement] = await Settlement.create(
        [{ kind, partyId, fiscalPeriodId, amount, allocations, method, status: 'posted' }],
        { session }
      );

      const cashAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.CASH, session);
      const arAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, session);
      const apAccount = await getSystemAccount(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE, session);

      const lines =
        kind === 'receipt'
          ? [
              { accountId: cashAccount._id, debit: amount, credit: 0 },
              { accountId: arAccount._id, debit: 0, credit: amount, partyId },
            ]
          : [
              { accountId: apAccount._id, debit: amount, credit: 0, partyId },
              { accountId: cashAccount._id, debit: 0, credit: amount },
            ];

      await postJournalEntry({
        fiscalPeriodId,
        sourceType: kind, // 'receipt' | 'payment'
        sourceId: settlement._id,
        lines,
        memo: `${kind === 'receipt' ? 'Receipt from' : 'Payment to'} party ${partyId}`,
        postedByUserId: actorUserId,
        session,
      });

      for (const { invoice, amountApplied } of invoices) {
        invoice.paidAmount = round2(invoice.paidAmount + amountApplied);
        invoice.$locals.actorUserId = actorUserId;
        await invoice.save({ session });
      }

      result = settlement;
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { createAndPostSettlement };
