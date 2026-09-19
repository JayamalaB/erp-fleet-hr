const mongoose = require('mongoose');
const VehicleAssignment = require('../models/VehicleAssignment');
const Vehicle = require('../models/Vehicle');
const Driver = require('../models/Driver');
const { NotFoundError, ConflictError, ValidationError } = require('../../../platform/errors');

async function getCurrentAssignment(vehicleId, session) {
  return VehicleAssignment.findOne({ vehicleId, effectiveTo: null }).session(session || null);
}

/**
 * Reassigns a vehicle to a (possibly new) driver/trailer. Never edits an
 * existing VehicleAssignment's driverId - closes the current open row and
 * inserts a new one, preserving full history (docs 4.3/4.6). The partial
 * unique index on VehicleAssignment (vehicleId, effectiveTo: null) is the
 * real guarantee against two simultaneously-open assignments for one
 * vehicle; this function's transaction makes the close+open atomic on top
 * of that.
 */
async function assignVehicle({ vehicleId, driverId, trailerId, reason, actorUserId }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const vehicle = await Vehicle.findById(vehicleId).session(session);
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      if (vehicle.status !== 'active') {
        throw new ConflictError('Only an active vehicle can be assigned to a driver');
      }
      const driver = await Driver.findById(driverId).session(session);
      if (!driver || driver.status !== 'active') {
        throw new ValidationError('Driver not found or not active');
      }

      const current = await getCurrentAssignment(vehicleId, session);
      if (current) {
        current.effectiveTo = new Date();
        await current.save({ session });
      }

      const [created] = await VehicleAssignment.create(
        [{ vehicleId, driverId, trailerId: trailerId || null, effectiveFrom: new Date(), effectiveTo: null, reason }],
        { session }
      );
      result = created;
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { assignVehicle, getCurrentAssignment };
