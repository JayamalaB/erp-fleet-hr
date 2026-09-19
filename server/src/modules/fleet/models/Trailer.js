const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const trailerSchema = new mongoose.Schema(
  {
    plateNo: { type: String, required: true, trim: true },
    type: { type: String },
    capacityTons: { type: Number },
    status: { type: String, enum: ['active', 'maintenance', 'inactive'], default: 'active' },
  },
  { timestamps: true, versionKey: false }
);

trailerSchema.index({ companyId: 1, plateNo: 1 }, { unique: true });
trailerSchema.plugin(tenantScoped);
trailerSchema.plugin(auditable, { entity: 'Trailer' });

module.exports = mongoose.model('Trailer', trailerSchema);
