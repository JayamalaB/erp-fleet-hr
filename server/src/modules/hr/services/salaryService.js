const mongoose = require('mongoose');
const SalaryStructure = require('../models/SalaryStructure');
const AllowanceDeduction = require('../models/AllowanceDeduction');
const { NotFoundError, ConflictError } = require('../../../platform/errors');

/**
 * Sets a new basic salary effective from `effectiveFrom`, closing whatever
 * row was previously open - never overwrites basicSalary in place (docs
 * 5.1). Symmetric to Fleet's assignmentService.assignVehicle.
 */
async function setSalary({ employeeId, basicSalary, effectiveFrom }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const current = await SalaryStructure.findOne({ employeeId, effectiveTo: null }).session(session);
      if (current) {
        current.effectiveTo = effectiveFrom || new Date();
        await current.save({ session });
      }
      const [created] = await SalaryStructure.create(
        [{ employeeId, basicSalary, effectiveFrom: effectiveFrom || new Date(), effectiveTo: null }],
        { session }
      );
      result = created;
    });
    return result;
  } finally {
    session.endSession();
  }
}

async function closeSalaryAsOf(employeeId, date, session) {
  const current = await SalaryStructure.findOne({ employeeId, effectiveTo: null }).session(session);
  if (current) {
    current.effectiveTo = date;
    await current.save({ session });
  }
}

async function addAllowanceOrDeduction({ employeeId, kind, label, amount, isRecurring, effectiveFrom }) {
  return AllowanceDeduction.create({ employeeId, kind, label, amount, isRecurring: isRecurring !== false, effectiveFrom: effectiveFrom || new Date() });
}

async function closeAllowancesAndDeductionsAsOf(employeeId, date, session) {
  await AllowanceDeduction.updateMany({ employeeId, effectiveTo: null }, { $set: { effectiveTo: date } }).session(session);
}

module.exports = { setSalary, closeSalaryAsOf, addAllowanceOrDeduction, closeAllowancesAndDeductionsAsOf };
