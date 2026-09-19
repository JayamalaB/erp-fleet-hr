const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const TRIP_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

const tripSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    // Set once, at creation, from the vehicle's currently-open
    // VehicleAssignment - never re-derived later (docs 4.4/4.6). This is
    // what keeps a completed trip's driver correct even after the vehicle
    // is reassigned to someone else.
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    trailerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trailer', default: null },
    contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', required: true },
    loadingInfo: { type: String },
    deliveryInfo: { type: String },
    distanceKm: { type: Number }, // only used when the contract's rateType is 'per_km'
    amount: { type: Number, required: true },
    status: { type: String, enum: TRIP_STATUSES, default: 'planned' },
    // Frozen at completion time, copied from this trip's own driverId field
    // (docs 4.4/4.6) - explicitly NOT re-read from VehicleAssignment, so a
    // later reassignment can never retroactively change a completed trip's
    // driver of record.
    driverIdAtCompletion: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

tripSchema.plugin(tenantScoped);
tripSchema.plugin(auditable, { entity: 'Trip' });

module.exports = mongoose.model('Trip', tripSchema);
module.exports.TRIP_STATUSES = TRIP_STATUSES;
