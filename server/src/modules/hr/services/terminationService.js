const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const SalaryStructure = require('../models/SalaryStructure');
const LeaveType = require('../models/LeaveType');
const LeaveLedgerEntry = require('../models/LeaveLedgerEntry');
const EndOfServiceRecord = require('../models/EndOfServiceRecord');
const salaryService = require('./salaryService');
const { getLeaveBalance } = require('./leaveService');
const { NotFoundError, ConflictError } = require('../../../platform/errors');

function round2(n) {
  return Math.round(n * 100) / 100;
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/**
 * Pure calculation, exported and unit-testable on its own (docs 3.6/8
 * pattern - the same one used for the accounting VAT/journal generator).
 * Follows the standard KSA Labor Law end-of-service convention (docs 5.8):
 * half a month's wage per year for each of the first 5 years, one month's
 * wage per year after that, prorated for a partial final year - with the
 * resignation forfeiture ladder from Labor Law Article 85 (a voluntary
 * resignation under 2 years forfeits EOS entirely; 2-5 years pays a third;
 * 5-10 years pays two-thirds; 10+ years pays in full). An employer-initiated
 * termination is never subject to that ladder - full EOS regardless of
 * tenure. All of this is parameterized so another jurisdiction's rules
 * would swap in as different constants, not a rewrite.
 */
function calculateEndOfService({ lastBasicSalary, yearsOfService, terminationType }) {
  const fullYears = Math.floor(yearsOfService);
  const partialYearFraction = yearsOfService - fullYears;

  function rateForYear(yearIndex) {
    // yearIndex is 1-based (the Nth year of service)
    return yearIndex <= 5 ? 0.5 : 1;
  }

  let grossEos = 0;
  for (let y = 1; y <= fullYears; y += 1) {
    grossEos += rateForYear(y) * lastBasicSalary;
  }
  if (partialYearFraction > 0) {
    grossEos += rateForYear(fullYears + 1) * lastBasicSalary * partialYearFraction;
  }
  grossEos = round2(grossEos);

  let payoutFraction = 1;
  if (terminationType === 'resignation') {
    if (yearsOfService < 2) payoutFraction = 0;
    else if (yearsOfService < 5) payoutFraction = 1 / 3;
    else if (yearsOfService < 10) payoutFraction = 2 / 3;
    else payoutFraction = 1;
  }

  return { grossEos, payoutFraction, eosAmount: round2(grossEos * payoutFraction) };
}

/**
 * Termination workflow (docs 5.8): closes the effective-dated salary and
 * allowance/deduction rows as of terminationDate (so calculatePayrollLine's
 * existing proration logic naturally pays only the worked fraction of the
 * final month - no special-cased mid-month code path needed), computes and
 * freezes the EndOfServiceRecord, and flips Employee.status so future
 * PayrollRun generation simply excludes this employee. Nothing about the
 * employee's prior history is deleted or altered.
 */
async function terminateEmployee({ employeeId, terminationDate, terminationType }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const employee = await Employee.findById(employeeId).session(session);
      if (!employee) throw new NotFoundError('Employee not found');
      if (employee.status === 'terminated') throw new ConflictError('Employee is already terminated');

      const effectiveDate = new Date(terminationDate);

      const salaryStructure = await SalaryStructure.findOne({ employeeId, effectiveTo: null }).session(session);
      const lastBasicSalary = salaryStructure ? salaryStructure.basicSalary : 0;

      await salaryService.closeSalaryAsOf(employeeId, effectiveDate, session);
      await salaryService.closeAllowancesAndDeductionsAsOf(employeeId, effectiveDate, session);

      const yearsOfService = (effectiveDate - employee.joinDate) / MS_PER_YEAR;
      const { eosAmount } = calculateEndOfService({ lastBasicSalary, yearsOfService, terminationType });

      const paidLeaveTypes = await LeaveType.find({ isPaid: true }).session(session);
      let remainingLeaveDays = 0;
      for (const lt of paidLeaveTypes) {
        remainingLeaveDays += await getLeaveBalance(employeeId, lt._id);
      }
      remainingLeaveDays = Math.max(round2(remainingLeaveDays), 0);
      const dailyRate = lastBasicSalary / 30;
      const remainingLeavePayout = round2(remainingLeaveDays * dailyRate);

      if (remainingLeaveDays > 0) {
        for (const lt of paidLeaveTypes) {
          const balance = await getLeaveBalance(employeeId, lt._id);
          if (balance > 0) {
            await LeaveLedgerEntry.create(
              [{ employeeId, leaveTypeId: lt._id, kind: 'payout', days: -balance, note: 'end-of-service-payout' }],
              { session }
            );
          }
        }
      }

      const [eosRecord] = await EndOfServiceRecord.create(
        [
          {
            employeeId,
            terminationDate: effectiveDate,
            terminationType,
            yearsOfService: round2(yearsOfService),
            lastBasicSalary,
            eosAmount,
            remainingLeaveDays,
            remainingLeavePayout,
            breakdown: { lastBasicSalary, yearsOfService: round2(yearsOfService) },
          },
        ],
        { session }
      );

      employee.status = 'terminated';
      employee.terminationDate = effectiveDate;
      employee.$locals.actorUserId = undefined;
      await employee.save({ session });

      result = eosRecord;
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { terminateEmployee, calculateEndOfService };
