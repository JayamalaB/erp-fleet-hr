const { createApp } = require('../src/app');
const { startTestDb, stopTestDb } = require('./helpers/testDb');
const { registerAndLogin, api } = require('./helpers/authHelpers');

let app;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

describe('Fleet Management - core workflow', () => {
  let client;
  let vehicleId, driverA, driverB, contractId;

  beforeAll(async () => {
    const auth = await registerAndLogin(app, { email: 'owner@fleetco.test', companyName: 'Fleet Co' });
    client = api(app, auth.accessToken);

    const modelRes = await client.post('/api/fleet/vehicle-models', { make: 'Volvo', model: 'FH16', capacityTons: 20 }).expect(201);
    const vehicleRes = await client
      .post('/api/fleet/vehicles', { plateNo: 'ABC-123', vehicleModelId: modelRes.body._id, manufactureYear: 2022 })
      .expect(201);
    vehicleId = vehicleRes.body._id;

    const driverARes = await client.post('/api/fleet/drivers', { name: 'Driver A', licenseNo: 'LIC-A' }).expect(201);
    driverA = driverARes.body._id;
    const driverBRes = await client.post('/api/fleet/drivers', { name: 'Driver B', licenseNo: 'LIC-B' }).expect(201);
    driverB = driverBRes.body._id;

    const contractRes = await client
      .post('/api/fleet/contracts', { customerRef: 'Acme Shipping Co', rateType: 'flat', rateValue: 1500 })
      .expect(201);
    contractId = contractRes.body._id;
  });

  test('inactive vehicles are not selectable for operational trips', async () => {
    await client.patch(`/api/fleet/vehicles/${vehicleId}/status`, { status: 'inactive' }).expect(200);
    const list = await client.get('/api/fleet/vehicles?selectableForTrip=true').expect(200);
    expect(list.body.find((v) => v._id === vehicleId)).toBeUndefined();

    const tripAttempt = await client.post('/api/fleet/trips', { vehicleId, contractId });
    expect(tripAttempt.status).toBe(409);

    await client.patch(`/api/fleet/vehicles/${vehicleId}/status`, { status: 'active' }).expect(200);
  });

  test('a vehicle cannot have two simultaneously open assignments (conflicting drivers)', async () => {
    await client.post('/api/fleet/assignments', { vehicleId, driverId: driverA }).expect(201);
    // Assigning again (even to the same driver) closes the old row and opens a new one - never two open rows.
    await client.post('/api/fleet/assignments', { vehicleId, driverId: driverA }).expect(201);
    const history = await client.get(`/api/fleet/vehicles/${vehicleId}/assignments`).expect(200);
    const openRows = history.body.filter((a) => a.effectiveTo === null);
    expect(openRows.length).toBe(1);
  });

  test('integration scenario: assign A -> create trip -> reassign to B -> history and completed-trip integrity both hold', async () => {
    // t0: vehicle is on Driver A (from previous test)
    // t1: create a trip - driver auto-resolved as A
    const tripRes = await client.post('/api/fleet/trips', { vehicleId, contractId, loadingInfo: 'Riyadh', deliveryInfo: 'Jeddah' }).expect(201);
    const tripId = tripRes.body._id;
    expect(tripRes.body.driverId).toBe(driverA);

    // t2: vehicle transferred to Driver B
    await client.post('/api/fleet/assignments', { vehicleId, driverId: driverB }).expect(201);

    // Current driver of the vehicle is now B
    const profile = await client.get(`/api/fleet/vehicles/${vehicleId}/profile`).expect(200);
    expect(profile.body.currentAssignment.driverId._id).toBe(driverB);

    // The trip created before the reassignment still shows driver A
    const tripBeforeCompletion = await client.get(`/api/fleet/trips?vehicleId=${vehicleId}`).expect(200);
    const found = tripBeforeCompletion.body.find((t) => t._id === tripId);
    expect(found.driverId).toBe(driverA);

    // t3: complete the trip after the reassignment - it must still freeze driver A, not B
    const completed = await client.post(`/api/fleet/trips/${tripId}/complete`, {}).expect(200);
    expect(completed.body.driverIdAtCompletion).toBe(driverA);
    expect(completed.body.status).toBe('completed');

    // Full assignment history for the vehicle remains intact: A's row is closed, B's is open
    const history = await client.get(`/api/fleet/vehicles/${vehicleId}/assignments`).expect(200);
    const closedForA = history.body.find((a) => a.driverId === driverA && a.effectiveTo !== null);
    const openForB = history.body.find((a) => a.driverId === driverB && a.effectiveTo === null);
    expect(closedForA).toBeDefined();
    expect(openForB).toBeDefined();
  });

  test('a completed trip cannot be cancelled', async () => {
    const tripRes = await client.post('/api/fleet/trips', { vehicleId, contractId }).expect(201);
    await client.post(`/api/fleet/trips/${tripRes.body._id}/complete`, {}).expect(200);
    const cancelAttempt = await client.post(`/api/fleet/trips/${tripRes.body._id}/cancel`, {});
    expect(cancelAttempt.status).toBe(409);
  });

  test('per-km contract pricing requires a distance and computes the amount', async () => {
    const perKmContract = await client
      .post('/api/fleet/contracts', { customerRef: 'Distance Customer', rateType: 'per_km', rateValue: 5 })
      .expect(201);

    const missingDistance = await client.post('/api/fleet/trips', { vehicleId, contractId: perKmContract.body._id });
    expect(missingDistance.status).toBe(422);

    const withDistance = await client
      .post('/api/fleet/trips', { vehicleId, contractId: perKmContract.body._id, distanceKm: 120 })
      .expect(201);
    expect(withDistance.body.amount).toBe(600);
  });
});
