const VehicleDocument = require('../models/VehicleDocument');
const { runAsSystem } = require('../../../platform/tenantContext');

/**
 * Scheduled daily (node-cron, wired in server.js). Cross-tenant by nature -
 * runs as system context (docs 2.2's explicit escape hatch), scanning every
 * company's documents in one pass rather than looping per company.
 *
 * Does NOT change Vehicle.status automatically - whether an expired
 * document should force a vehicle into 'maintenance'/'inactive' is a
 * per-company policy decision left to a later increment; this job's job is
 * only to surface the alert.
 */
async function findExpiringDocuments(windowDays = 30) {
  return runAsSystem(async () => {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 3600 * 1000);
    return VehicleDocument.find({ expiryDate: { $gte: now, $lte: windowEnd } })
      .populate('vehicleId')
      .sort({ expiryDate: 1 });
  });
}

async function runDocumentExpiryCheck() {
  const expiring = await findExpiringDocuments(30);
  for (const doc of expiring) {
    // eslint-disable-next-line no-console
    console.log(
      `[document-expiry] ${doc.type} for vehicle ${doc.vehicleId?.plateNo || doc.vehicleId} expires ${doc.expiryDate.toISOString()}`
    );
  }
  return expiring.length;
}

module.exports = { findExpiringDocuments, runDocumentExpiryCheck };
