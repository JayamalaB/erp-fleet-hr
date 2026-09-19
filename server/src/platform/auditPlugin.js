const { getCurrentCompanyId } = require('./tenantContext');

/**
 * Attach to any schema: schema.plugin(auditable, { entity: 'SalesInvoice' }).
 * Writes one AuditLog row per create/update/delete, with before/after
 * snapshots, without individual services having to remember to call it.
 *
 * Requires AuditLog to be required lazily to avoid a require cycle with
 * models that load before platform/models is fully initialized.
 */
function auditable(schema, options = {}) {
  const entityName = options.entity || schema.__modelName || 'Unknown';

  schema.pre('save', async function captureBeforeSnapshot() {
    if (this.isNew) {
      this.$locals.auditAction = 'create';
      this.$locals.auditBefore = null;
      return;
    }
    this.$locals.auditAction = 'update';
    const previous = await this.constructor.findById(this._id).lean();
    this.$locals.auditBefore = previous;
  });

  schema.post('save', async function writeAuditLog(doc) {
    const AuditLog = require('./models/AuditLog');
    const companyId = doc.companyId || getCurrentCompanyId();
    await AuditLog.create({
      companyId,
      entity: entityName,
      entityId: doc._id,
      action: doc.$locals.auditAction || 'update',
      actorUserId: doc.$locals.actorUserId,
      before: doc.$locals.auditBefore,
      after: doc.toObject(),
      requestId: doc.$locals.requestId,
    });
  });

  schema.pre('findOneAndDelete', async function captureDeleteSnapshot() {
    this._auditBefore = await this.model.findOne(this.getFilter()).lean();
  });

  schema.post('findOneAndDelete', async function writeDeleteAuditLog(doc) {
    if (!doc) return;
    const AuditLog = require('./models/AuditLog');
    await AuditLog.create({
      companyId: doc.companyId,
      entity: entityName,
      entityId: doc._id,
      action: 'delete',
      before: this._auditBefore,
      after: null,
    });
  });
}

module.exports = { auditable };
