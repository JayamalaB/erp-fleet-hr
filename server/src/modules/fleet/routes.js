const express = require('express');
const { z } = require('zod');
const { requirePermission } = require('../../platform/rbac');
const { ValidationError, NotFoundError } = require('../../platform/errors');

const VehicleModel = require('./models/VehicleModel');
const Vehicle = require('./models/Vehicle');
const Driver = require('./models/Driver');
const Trailer = require('./models/Trailer');
const VehicleDocument = require('./models/VehicleDocument');
const MaintenanceRecord = require('./models/MaintenanceRecord');
const FuelRecord = require('./models/FuelRecord');
const Contract = require('./models/Contract');
const Trip = require('./models/Trip');

const assignmentService = require('./services/assignmentService');
const tripService = require('./services/tripService');
const vehicleProfileService = require('./services/vehicleProfileService');
const { findExpiringDocuments } = require('./jobs/documentExpiryJob');

const router = express.Router();

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(new ValidationError('Invalid request body', result.error.flatten()));
    req.body = result.data;
    return next();
  };
}

// ---------- Vehicle Models ----------
router.post('/vehicle-models', requirePermission('fleet:vehicle-model:write'), async (req, res, next) => {
  try {
    res.status(201).json(await VehicleModel.create(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/vehicle-models', requirePermission('fleet:vehicle-model:read'), async (req, res, next) => {
  try {
    res.json(await VehicleModel.find());
  } catch (err) {
    next(err);
  }
});

// ---------- Vehicles ----------
const vehicleSchema = z.object({
  plateNo: z.string().min(1),
  chassisNo: z.string().optional(),
  vehicleModelId: z.string().min(1),
  manufactureYear: z.number().int().optional(),
});

router.post('/vehicles', requirePermission('fleet:vehicle:write'), validate(vehicleSchema), async (req, res, next) => {
  try {
    res.status(201).json(await Vehicle.create(req.body));
  } catch (err) {
    next(err);
  }
});

// Only active vehicles - directly satisfies "inactive vehicles must not be
// selectable for operational trips" at the query level (docs 4.3), not
// just a disabled UI option.
router.get('/vehicles', requirePermission('fleet:vehicle:read'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.selectableForTrip === 'true') filter.status = 'active';
    else if (req.query.status) filter.status = req.query.status;
    res.json(await Vehicle.find(filter));
  } catch (err) {
    next(err);
  }
});

router.get('/vehicles/:id/profile', requirePermission('fleet:vehicle:read'), async (req, res, next) => {
  try {
    res.json(await vehicleProfileService.getVehicleProfile(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch('/vehicles/:id/status', requirePermission('fleet:vehicle:write'), async (req, res, next) => {
  try {
    const schema = z.object({ status: z.enum(['active', 'maintenance', 'inactive', 'disposed']) });
    const { status } = schema.parse(req.body);
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    vehicle.status = status;
    vehicle.$locals.actorUserId = req.context.userId;
    await vehicle.save();
    res.json(vehicle);
  } catch (err) {
    next(err);
  }
});

// ---------- Drivers ----------
const driverSchema = z.object({
  name: z.string().min(1),
  employeeId: z.string().optional().nullable(),
  isSubcontractor: z.boolean().optional(),
  licenseNo: z.string().min(1),
  licenseExpiry: z.string().optional(),
});
router.post('/drivers', requirePermission('fleet:driver:write'), validate(driverSchema), async (req, res, next) => {
  try {
    res.status(201).json(await Driver.create(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/drivers', requirePermission('fleet:driver:read'), async (req, res, next) => {
  try {
    res.json(await Driver.find());
  } catch (err) {
    next(err);
  }
});

// ---------- Trailers ----------
router.post('/trailers', requirePermission('fleet:trailer:write'), async (req, res, next) => {
  try {
    res.status(201).json(await Trailer.create(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/trailers', requirePermission('fleet:trailer:read'), async (req, res, next) => {
  try {
    res.json(await Trailer.find());
  } catch (err) {
    next(err);
  }
});

// ---------- Vehicle Assignment ----------
const assignmentSchema = z.object({
  vehicleId: z.string().min(1),
  driverId: z.string().min(1),
  trailerId: z.string().optional().nullable(),
  reason: z.string().optional(),
});
router.post('/assignments', requirePermission('fleet:assignment:write'), validate(assignmentSchema), async (req, res, next) => {
  try {
    res.status(201).json(await assignmentService.assignVehicle({ ...req.body, actorUserId: req.context.userId }));
  } catch (err) {
    next(err);
  }
});
router.get('/vehicles/:id/assignments', requirePermission('fleet:assignment:read'), async (req, res, next) => {
  try {
    const VehicleAssignment = require('./models/VehicleAssignment');
    res.json(await VehicleAssignment.find({ vehicleId: req.params.id }).sort({ effectiveFrom: -1 }));
  } catch (err) {
    next(err);
  }
});

// ---------- Documents ----------
const documentSchema = z.object({
  vehicleId: z.string().min(1),
  type: z.enum(['registration', 'insurance', 'inspection', 'permit']),
  documentNo: z.string().optional(),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  fileRef: z.string().optional(),
});
router.post('/documents', requirePermission('fleet:document:write'), validate(documentSchema), async (req, res, next) => {
  try {
    res.status(201).json(await VehicleDocument.create(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/documents/expiring', requirePermission('fleet:document:read'), async (req, res, next) => {
  try {
    res.json(await findExpiringDocuments(Number(req.query.windowDays) || 30));
  } catch (err) {
    next(err);
  }
});

// ---------- Maintenance ----------
router.post('/maintenance', requirePermission('fleet:maintenance:write'), async (req, res, next) => {
  try {
    const record = await MaintenanceRecord.create({
      ...req.body,
      statusHistory: [{ status: req.body.status || 'scheduled', byUserId: req.context.userId }],
    });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});
router.patch('/maintenance/:id/status', requirePermission('fleet:maintenance:write'), async (req, res, next) => {
  try {
    const schema = z.object({ status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']), note: z.string().optional() });
    const { status, note } = schema.parse(req.body);
    const record = await MaintenanceRecord.findById(req.params.id);
    if (!record) throw new NotFoundError('Maintenance record not found');
    record.status = status;
    record.statusHistory.push({ status, byUserId: req.context.userId, note });
    record.$locals.actorUserId = req.context.userId;
    await record.save();
    res.json(record);
  } catch (err) {
    next(err);
  }
});

// ---------- Fuel ----------
router.post('/fuel', requirePermission('fleet:fuel:write'), async (req, res, next) => {
  try {
    res.status(201).json(await FuelRecord.create(req.body));
  } catch (err) {
    next(err);
  }
});

// ---------- Contracts ----------
const contractSchema = z.object({
  customerRef: z.string().min(1),
  rateType: z.enum(['flat', 'per_km']),
  rateValue: z.number().positive(),
});
router.post('/contracts', requirePermission('fleet:contract:write'), validate(contractSchema), async (req, res, next) => {
  try {
    res.status(201).json(await Contract.create(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/contracts', requirePermission('fleet:contract:read'), async (req, res, next) => {
  try {
    res.json(await Contract.find({ isActive: true }));
  } catch (err) {
    next(err);
  }
});

// ---------- Trips ----------
const createTripSchema = z.object({
  vehicleId: z.string().min(1),
  contractId: z.string().min(1),
  loadingInfo: z.string().optional(),
  deliveryInfo: z.string().optional(),
  distanceKm: z.number().positive().optional(),
});
router.post('/trips', requirePermission('fleet:trip:write'), validate(createTripSchema), async (req, res, next) => {
  try {
    res.status(201).json(await tripService.createTrip(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/trips', requirePermission('fleet:trip:read'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.vehicleId) filter.vehicleId = req.query.vehicleId;
    if (req.query.driverId) filter.driverId = req.query.driverId;
    if (req.query.status) filter.status = req.query.status;
    res.json(await Trip.find(filter).sort({ createdAt: -1 }));
  } catch (err) {
    next(err);
  }
});
router.post('/trips/:id/start', requirePermission('fleet:trip:write'), async (req, res, next) => {
  try {
    res.json(await tripService.startTrip(req.params.id));
  } catch (err) {
    next(err);
  }
});
router.post('/trips/:id/complete', requirePermission('fleet:trip:write'), async (req, res, next) => {
  try {
    res.json(await tripService.completeTrip(req.params.id));
  } catch (err) {
    next(err);
  }
});
router.post('/trips/:id/cancel', requirePermission('fleet:trip:write'), async (req, res, next) => {
  try {
    res.json(await tripService.cancelTrip(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
