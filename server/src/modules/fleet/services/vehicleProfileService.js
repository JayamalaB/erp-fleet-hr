const Vehicle = require('../models/Vehicle');
const VehicleDocument = require('../models/VehicleDocument');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const FuelRecord = require('../models/FuelRecord');
const Trip = require('../models/Trip');
const { getCurrentAssignment } = require('./assignmentService');
const { NotFoundError } = require('../../../platform/errors');

/**
 * Query-time composition, not a denormalized "profile" document that every
 * module writes into (docs 4.2). Each source collection stays owned by its
 * own service; this can never itself drift from the data it summarizes
 * because it holds no state of its own.
 */
async function getVehicleProfile(vehicleId) {
  const vehicle = await Vehicle.findById(vehicleId).populate('vehicleModelId');
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  const [assignment, documents, maintenance, fuel, trips] = await Promise.all([
    getCurrentAssignment(vehicleId).then((a) => (a ? a.populate(['driverId', 'trailerId']) : null)),
    VehicleDocument.find({ vehicleId }).sort({ expiryDate: 1 }),
    MaintenanceRecord.find({ vehicleId }).sort({ createdAt: -1 }).limit(20),
    FuelRecord.find({ vehicleId }).sort({ at: -1 }).limit(20),
    Trip.find({ vehicleId }).sort({ createdAt: -1 }).limit(20),
  ]);

  const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
  const totalFuelCost = fuel.reduce((sum, f) => sum + (f.cost || 0), 0);

  const now = new Date();
  const expiringDocuments = documents.filter((d) => d.expiryDate > now && d.expiryDate < new Date(now.getTime() + 30 * 24 * 3600 * 1000));

  return {
    vehicle,
    currentAssignment: assignment,
    documents,
    expiringDocuments,
    maintenanceHistory: maintenance,
    fuelHistory: fuel,
    tripHistory: trips,
    costs: {
      totalMaintenanceCost,
      totalFuelCost,
      totalCost: totalMaintenanceCost + totalFuelCost,
    },
  };
}

module.exports = { getVehicleProfile };
