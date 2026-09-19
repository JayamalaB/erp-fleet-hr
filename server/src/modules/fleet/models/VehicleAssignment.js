const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');

// Append-only history (docs 4.3/4.6): a reassignment closes the current row
// (sets effectiveTo) and inserts a new one - driverId is NEVER updated in
// place on an existing row. "Current assignment" is simply the row with
// effectiveTo === null for that vehicle.
const vehicleAssignmentSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    trailerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trailer', default: null },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null },
    reason: { type: String },
  },
  { timestamps: true, versionKey: false }
);

// The actual guarantee behind "a vehicle cannot be assigned to conflicting
// drivers" (docs 4.3): at most one row with effectiveTo === null per
// vehicle, enforced by the database, not just application logic.
vehicleAssignmentSchema.index(
  { companyId: 1, vehicleId: 1 },
  { unique: true, partialFilterExpression: { effectiveTo: null } }
);
vehicleAssignmentSchema.plugin(tenantScoped);
// No auditable() plugin: this collection IS the audit trail for
// assignments by construction (append-only, never mutated in place).

module.exports = mongoose.model('VehicleAssignment', vehicleAssignmentSchema);
