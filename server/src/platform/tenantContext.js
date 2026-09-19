const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/**
 * Runs `fn` with the given companyId bound to the async context for the
 * lifetime of the request. Every DB call made anywhere downstream (even
 * three services deep) can read it back via getCurrentCompanyId() without
 * it being threaded through every function signature by hand.
 */
function runWithTenant(companyId, fn) {
  return als.run({ companyId }, fn);
}

function getCurrentCompanyId() {
  const store = als.getStore();
  return store ? store.companyId : undefined;
}

/**
 * Escape hatch for genuinely cross-tenant system code (the outbox dispatcher,
 * scheduled jobs that scan all companies). Must be imported explicitly and
 * used sparingly - grep-able, not a default.
 */
function runAsSystem(fn) {
  return als.run({ companyId: '__SYSTEM__' }, fn);
}

module.exports = { runWithTenant, getCurrentCompanyId, runAsSystem };
