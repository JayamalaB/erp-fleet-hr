const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');
const { round2 } = require('./journalService');

/**
 * All reports below are read-only aggregations over JournalEntry - never
 * separately maintained running totals - so they can never drift from the
 * ledger by construction (docs 3.2 step 7).
 */

async function balancesByAccount({ fiscalPeriodId, uptoDate } = {}) {
  const match = {};
  if (fiscalPeriodId) match.fiscalPeriodId = new mongoose.Types.ObjectId(fiscalPeriodId);
  if (uptoDate) match.postedAt = { $lte: new Date(uptoDate) };

  const rows = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        totalDebit: { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
  ]);

  const accounts = await Account.find({ _id: { $in: rows.map((r) => r._id) } }).lean();
  const accountById = new Map(accounts.map((a) => [String(a._id), a]));

  return rows.map((r) => {
    const account = accountById.get(String(r._id));
    return {
      accountId: r._id,
      code: account?.code,
      name: account?.name,
      type: account?.type,
      totalDebit: round2(r.totalDebit),
      totalCredit: round2(r.totalCredit),
      netBalance: round2(r.totalDebit - r.totalCredit),
    };
  });
}

async function trialBalance(fiscalPeriodId) {
  const rows = await balancesByAccount({ fiscalPeriodId });
  const totalDebit = round2(rows.reduce((s, r) => s + r.totalDebit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.totalCredit, 0));
  return { rows: rows.sort((a, b) => (a.code || '').localeCompare(b.code || '')), totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

async function profitAndLoss(fiscalPeriodId) {
  const rows = await balancesByAccount({ fiscalPeriodId });
  const revenueRows = rows.filter((r) => r.type === 'Revenue');
  const expenseRows = rows.filter((r) => r.type === 'Expense');
  const totalRevenue = round2(revenueRows.reduce((s, r) => s + (r.totalCredit - r.totalDebit), 0));
  const totalExpense = round2(expenseRows.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0));
  return { revenue: revenueRows, expense: expenseRows, totalRevenue, totalExpense, netIncome: round2(totalRevenue - totalExpense) };
}

/**
 * Cumulative as-of-date snapshot (a balance sheet is a point-in-time
 * statement, unlike the period-scoped Trial Balance / P&L). Equity is
 * approximated here as posted Equity-account balances plus cumulative
 * retained earnings (all-time net income) - a simplification appropriate
 * for this assessment's scope; a full build would post an explicit
 * period-close entry moving net income into Retained Earnings.
 */
async function balanceSheet(asOfDate) {
  const rows = await balancesByAccount({ uptoDate: asOfDate });
  const assets = rows.filter((r) => r.type === 'Asset');
  const liabilities = rows.filter((r) => r.type === 'Liability');
  const equityRows = rows.filter((r) => r.type === 'Equity');

  const totalAssets = round2(assets.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + (r.totalCredit - r.totalDebit), 0));
  const postedEquity = round2(equityRows.reduce((s, r) => s + (r.totalCredit - r.totalDebit), 0));

  const revenueRows = rows.filter((r) => r.type === 'Revenue');
  const expenseRows = rows.filter((r) => r.type === 'Expense');
  const retainedEarnings = round2(
    revenueRows.reduce((s, r) => s + (r.totalCredit - r.totalDebit), 0) -
      expenseRows.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0)
  );

  const totalEquity = round2(postedEquity + retainedEarnings);

  return {
    assets,
    liabilities,
    equity: equityRows,
    retainedEarnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balances: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
}

/** Live sum of AR/AP-tagged lines for one party - never a cached counter (docs 3.1). */
async function partyBalance(partyId) {
  const rows = await JournalEntry.aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.partyId': new mongoose.Types.ObjectId(partyId) } },
    { $group: { _id: null, totalDebit: { $sum: '$lines.debit' }, totalCredit: { $sum: '$lines.credit' } } },
  ]);
  const r = rows[0] || { totalDebit: 0, totalCredit: 0 };
  return { totalDebit: round2(r.totalDebit), totalCredit: round2(r.totalCredit), netBalance: round2(r.totalDebit - r.totalCredit) };
}

module.exports = { trialBalance, profitAndLoss, balanceSheet, partyBalance };
