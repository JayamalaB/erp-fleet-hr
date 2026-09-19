const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true }, // 'create' | 'update' | 'delete' | custom e.g. 'invoice.posted'
    actorUserId: { type: mongoose.Schema.Types.ObjectId, required: false },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    requestId: { type: String, required: false },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
