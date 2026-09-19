const JournalEntry = require('../models/JournalEntry');
const FiscalPeriod = require('../models/FiscalPeriod');
const { UnbalancedEntryError, PeriodLockedError, DuplicatePostingError, NotFoundError } = require('../../../platform/errors');

const EPSILON = 0.005; // half a cent, to absorb floating-point rounding

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The single choke point every posting flow in Accounting goes through
 * (invoices, receipts/payments, manual entries, reversals). Encapsulates
 * the three guarantees described in docs 2.4/3.5:
 *   1. debits === credits (UnbalancedEntryError otherwise)
 *   2. the fiscal period is open (PeriodLockedError otherwise)
 *   3. exactly one entry per (sourceType, sourceId) (DuplicatePostingError
 *      on a retry/race, via the unique index on JournalEntry - not a
 *      pre-check, which would still race)
 */
async function postJournalEntry({ fiscalPeriodId, sourceType, sourceId, lines, memo, postedByUserId, session }) {
  const totalDebit = round2(lines.reduce((sum, l) => sum + (l.debit || 0), 0));
  const totalCredit = round2(lines.reduce((sum, l) => sum + (l.credit || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    throw new UnbalancedEntryError(`Entry does not balance: debit ${totalDebit} vs credit ${totalCredit}`);
  }

  const period = await FiscalPeriod.findById(fiscalPeriodId).session(session);
  if (!period) throw new NotFoundError('Fiscal period not found');
  if (period.status !== 'open') {
    throw new PeriodLockedError(`Fiscal period '${period.name}' is ${period.status} - posting is not allowed`);
  }

  try {
    const [entry] = await JournalEntry.create(
      [{ fiscalPeriodId, sourceType, sourceId, lines, memo, postedByUserId }],
      { session }
    );
    return entry;
  } catch (err) {
    if (err.code === 11000) {
      throw new DuplicatePostingError(`A journal entry already exists for ${sourceType}:${sourceId}`);
    }
    throw err;
  }
}

module.exports = { postJournalEntry, round2 };
