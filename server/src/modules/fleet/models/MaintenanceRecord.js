const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], required: true },
    at: { type: Date, default: Date.now },
    byUserId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String },
  },
  { _id: false }
);

const maintenanceRecordSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    type: { type: String, enum: ['scheduled', 'repair'], required: true },
    description: { type: String },
    odometer: { type: Number },
    cost: { type: Number, default: 0 },
    performedAt: { type: Date },
    nextDueAt: { type: Date },
    nextDueOdometer: { type: Number },
    status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled' },
    // Auditable history of status changes specifically (docs 4.5) - the
    // shared AuditLog (docs 2.6) also records this generically, but
    // maintenance status additionally drives vehicle-availability logic,
    // so it is kept queryable directly on the record itself.
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

maintenanceRecordSchema.plugin(tenantScoped);
maintenanceRecordSchema.plugin(auditable, { entity: 'MaintenanceRecord' });

module.exports = mongoose.model('MaintenanceRecord', maintenanceRecordSchema);
