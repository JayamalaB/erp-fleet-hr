const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const Vehicle = require('../models/Vehicle');
const Contract = require('../models/Contract');
const Driver = require('../models/Driver');
const { getCurrentAssignment } = require('./assignmentService');
const { publish } = require('../../../platform/eventBus');
const { getCurrentCompanyId } = require('../../../platform/tenantContext');
const { NotFoundError, ConflictError, ValidationError } = require('../../../platform/errors');

function priceTrip(contract, distanceKm) {
  if (contract.rateType === 'flat') return contract.rateValue;
  if (contract.rateType === 'per_km') {
    if (!distanceKm || distanceKm <= 0) {
      throw new ValidationError('distanceKm is required for a per-km contract');
    }
    return Math.round(contract.rateValue * distanceKm * 100) / 100;
  }
  throw new ValidationError(`Unknown contract rate type: ${contract.rateType}`);
}

/**
 * Create Trip -> resolve Vehicle -> auto-resolve assigned Driver -> price
 * from the contract (docs 4.4). The operator never hand-picks a driver
 * independently of the vehicle: driverId/trailerId come only from the
 * vehicle's current open VehicleAssignment, and an inactive vehicle is
 * rejected here even if some other screen let it be selected (docs 4.3).
 */
async function createTrip({ vehicleId, contractId, loadingInfo, deliveryInfo, distanceKm }) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw new NotFoundError('Vehicle not found');
  if (vehicle.status !== 'active') {
    throw new ConflictError('Inactive vehicles are not selectable for operational trips');
  }

  const assignment = await getCurrentAssignment(vehicleId);
  if (!assignment) {
    throw new ValidationError('This vehicle has no current driver assignment - assign a driver before creating a trip');
  }

  const contract = await Contract.findById(contractId);
  if (!contract || !contract.isActive) throw new NotFoundError('Contract not found or inactive');

  const amount = priceTrip(contract, distanceKm);

  return Trip.create({
    vehicleId,
    driverId: assignment.driverId,
    trailerId: assignment.trailerId,
    contractId,
    loadingInfo,
    deliveryInfo,
    distanceKm,
    amount,
    status: 'planned',
  });
}

async function startTrip(tripId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw new NotFoundError('Trip not found');
  if (trip.status !== 'planned') throw new ConflictError(`Trip is ${trip.status}, cannot start`);
  trip.status = 'in_progress';
  await trip.save();
  return trip;
}

/**
 * Completes a trip and freezes driverIdAtCompletion from the trip's OWN
 * driverId field (never re-read from VehicleAssignment - docs 4.4/4.6),
 * then publishes trip.completed for HR/Payroll and Accounting to consume
 * (docs 2.5/6). Fleet has no idea whether anyone is listening.
 */
async function completeTrip(tripId) {
  const companyId = getCurrentCompanyId();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const trip = await Trip.findById(tripId).session(session);
      if (!trip) throw new NotFoundError('Trip not found');
      if (!['planned', 'in_progress'].includes(trip.status)) {
        throw new ConflictError(`Trip is already ${trip.status}`);
      }
      const driver = await Driver.findById(trip.driverId).session(session);

      trip.status = 'completed';
      trip.driverIdAtCompletion = trip.driverId;
      trip.completedAt = new Date();
      await trip.save({ session });

      const contract = await Contract.findById(trip.contractId).session(session);

      await publish(
        'trip.completed',
        companyId,
        {
          tripId: String(trip._id),
          companyId: String(companyId),
          vehicleId: String(trip.vehicleId),
          driverId: driver ? String(driver._id) : null,
          // Fleet owns Driver.employeeId as an opaque soft-link (docs 4.5) -
          // forwarding its value in the event is not a live coupling to HR's
          // schema, just passing along a fact HR needs to resolve eligibility.
          employeeId: driver && driver.employeeId ? String(driver.employeeId) : null,
          isSubcontractor: driver ? driver.isSubcontractor : true,
          customerRef: contract ? contract.customerRef : null,
          contractId: String(trip.contractId),
          amount: trip.amount,
          completedAt: trip.completedAt.toISOString(),
        },
        session
      );

      result = trip;
    });
    return result;
  } finally {
    session.endSession();
  }
}

async function cancelTrip(tripId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw new NotFoundError('Trip not found');
  if (trip.status === 'completed') throw new ConflictError('A completed trip cannot be cancelled');
  trip.status = 'cancelled';
  await trip.save();
  return trip;
}

module.exports = { createTrip, startTrip, completeTrip, cancelTrip, priceTrip };
