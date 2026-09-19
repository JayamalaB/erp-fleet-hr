const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const fuelRecordSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
    odometer: { type: Number },
    liters: { type: Number, required: true },
    cost: { type: Number, required: true },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

fuelRecordSchema.plugin(tenantScoped);
fuelRecordSchema.plugin(auditable, { entity: 'FuelRecord' });

module.exports = mongoose.model('FuelRecord', fuelRecordSchema);
