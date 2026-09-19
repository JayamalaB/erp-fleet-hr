const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const VEHICLE_STATUSES = ['active', 'maintenance', 'inactive', 'disposed'];

const vehicleSchema = new mongoose.Schema(
  {
    plateNo: { type: String, required: true, trim: true },
    chassisNo: { type: String, trim: true },
    vehicleModelId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleModel', required: true },
    manufactureYear: { type: Number },
    // Single source of truth for operational eligibility (docs 4.3/4.7) -
    // every "can this vehicle be used" check reads this field, never a
    // UI-only disabled state.
    status: { type: String, enum: VEHICLE_STATUSES, default: 'active' },
  },
  { timestamps: true, versionKey: false }
);

vehicleSchema.index({ companyId: 1, plateNo: 1 }, { unique: true });
vehicleSchema.plugin(tenantScoped);
vehicleSchema.plugin(auditable, { entity: 'Vehicle' });

module.exports = mongoose.model('Vehicle', vehicleSchema);
module.exports.VEHICLE_STATUSES = VEHICLE_STATUSES;
