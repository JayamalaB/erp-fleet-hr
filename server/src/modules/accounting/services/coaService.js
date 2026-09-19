const Account = require('../models/Account');

// Standard control-account codes the rest of the accounting module resolves
// by role instead of hardcoding an ObjectId or a magic string anywhere else.
// A company can rename/reorganize its COA freely; as long as these codes
// exist, posting logic keeps working.
const SYSTEM_ACCOUNT_CODES = {
  CASH: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  VAT_INPUT_RECEIVABLE: '1200',
  ACCOUNTS_PAYABLE: '2000',
  VAT_OUTPUT_PAYABLE: '2100',
  SERVICE_REVENUE: '4000',
  GENERAL_EXPENSE: '5000',
};

const DEFAULT_CHART = [
  { code: SYSTEM_ACCOUNT_CODES.CASH, name: 'Cash / Bank', type: 'Asset' },
  { code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'Accounts Receivable - Trade', type: 'Asset' },
  { code: SYSTEM_ACCOUNT_CODES.VAT_INPUT_RECEIVABLE, name: 'VAT Input Receivable', type: 'Asset' },
  { code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'Accounts Payable - Trade', type: 'Liability' },
  { code: SYSTEM_ACCOUNT_CODES.VAT_OUTPUT_PAYABLE, name: 'VAT Output Payable', type: 'Liability' },
  { code: SYSTEM_ACCOUNT_CODES.SERVICE_REVENUE, name: 'Service Revenue', type: 'Revenue' },
  { code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE, name: 'General Expense', type: 'Expense' },
];

async function seedDefaultChartOfAccounts(companyId, session) {
  const docs = DEFAULT_CHART.map((a) => ({ ...a, companyId }));
  return Account.insertMany(docs, { session });
}

async function getSystemAccount(code, session) {
  const account = await Account.findOne({ code }).session(session || null);
  if (!account) {
    throw new Error(`System account with code ${code} not found - has the Chart of Accounts been seeded?`);
  }
  return account;
}

module.exports = { SYSTEM_ACCOUNT_CODES, DEFAULT_CHART, seedDefaultChartOfAccounts, getSystemAccount };
