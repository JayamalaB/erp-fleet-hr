const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const vehicleModelSchema = new mongoose.Schema(
  {
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    capacityTons: { type: Number },
    fuelType: { type: String, enum: ['diesel', 'petrol', 'electric', 'hybrid'], default: 'diesel' },
  },
  { timestamps: true, versionKey: false }
);

vehicleModelSchema.plugin(tenantScoped);
vehicleModelSchema.plugin(auditable, { entity: 'VehicleModel' });

module.exports = mongoose.model('VehicleModel', vehicleModelSchema);
