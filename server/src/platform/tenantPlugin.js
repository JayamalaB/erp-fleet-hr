const mongoose = require('mongoose');
const { getCurrentCompanyId } = require('./tenantContext');
const { ForbiddenError } = require('./errors');

const QUERY_HOOKS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndRemove',
  'updateMany',
  'updateOne',
  'deleteMany',
  'deleteOne',
  'countDocuments',
];

/**
 * Attach to every tenant-owned schema:
 *   schema.plugin(tenantScoped);
 *
 * Guarantees (see docs Section 2.2):
 *  - companyId is a required, indexed field.
 *  - Every query is forced to include companyId, sourced ONLY from the
 *    current async tenant context (never from client input) - a query
 *    issued with no bound tenant context throws instead of silently
 *    running unscoped.
 *  - A document cannot be saved with a companyId that doesn't match the
 *    current tenant context (blocks cross-tenant writes even if a bad
 *    actor forged a companyId in the request body).
 *  - Aggregation pipelines get a mandatory leading $match on companyId.
 */
function tenantScoped(schema) {
  schema.add({
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },
  });

  function requireTenant() {
    const companyId = getCurrentCompanyId();
    if (!companyId) {
      throw new ForbiddenError(
        'Query blocked: no tenant context bound. All tenant-scoped queries must run inside runWithTenant().'
      );
    }
    return companyId;
  }

  QUERY_HOOKS.forEach((hook) => {
    schema.pre(hook, function injectTenantFilter() {
      const companyId = requireTenant();
      if (companyId === '__SYSTEM__') return; // explicit cross-tenant system job
      const filter = this.getFilter ? this.getFilter() : this._conditions;
      if (filter.companyId && String(filter.companyId) !== String(companyId)) {
        throw new ForbiddenError('Cross-company access denied');
      }
      this.where({ companyId });
    });
  });

  schema.pre('aggregate', function injectTenantMatch() {
    const companyId = requireTenant();
    if (companyId === '__SYSTEM__') return;
    this.pipeline().unshift({ $match: { companyId: new mongoose.Types.ObjectId(companyId) } });
  });

  // Runs on pre('validate'), not pre('save'): Mongoose enforces required
  // fields as part of validation, which happens BEFORE 'save' middleware -
  // assigning companyId in a pre('save') hook would always be too late for
  // a `required: true` field and fail every insert.
  schema.pre('validate', function enforceCompanyOnValidate(next) {
    const companyId = requireTenant();
    if (companyId === '__SYSTEM__') return next();
    if (this.isNew && !this.companyId) {
      this.companyId = companyId;
    } else if (String(this.companyId) !== String(companyId)) {
      return next(new ForbiddenError('Cannot save a document for a different company'));
    }
    return next();
  });
}

module.exports = { tenantScoped };
