const FiscalPeriod = require('../models/FiscalPeriod');
const { NotFoundError, ConflictError } = require('../../../platform/errors');

async function createFiscalPeriod({ name, startDate, endDate }) {
  return FiscalPeriod.create({ name, startDate, endDate, status: 'open' });
}

const VALID_TRANSITIONS = {
  open: ['closed'],
  closed: ['locked', 'open'], // closed can be reopened by an authorized user before it is hard-locked
  locked: [],
};

async function transitionPeriod(periodId, targetStatus, actorUserId) {
  const period = await FiscalPeriod.findById(periodId);
  if (!period) throw new NotFoundError('Fiscal period not found');
  const allowed = VALID_TRANSITIONS[period.status] || [];
  if (!allowed.includes(targetStatus)) {
    throw new ConflictError(`Cannot move fiscal period from '${period.status}' to '${targetStatus}'`);
  }
  period.status = targetStatus;
  period.$locals.actorUserId = actorUserId;
  await period.save();
  return period;
}

module.exports = { createFiscalPeriod, transitionPeriod };
