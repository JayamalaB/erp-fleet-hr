const { runWithTenant } = require('./tenantContext');
const { UnauthorizedError } = require('./errors');

/**
 * Must run after authenticate(). Binds req.context.companyId to the async
 * context for the rest of the request so the tenant-scoping Mongoose plugin
 * can enforce isolation without any controller/service passing companyId
 * around by hand.
 */
function bindTenantContext(req, res, next) {
  if (!req.context || !req.context.companyId) {
    return next(new UnauthorizedError('No active company context on this session'));
  }
  return runWithTenant(req.context.companyId, next);
}

module.exports = { bindTenantContext };
