const OutboxEvent = require('./models/OutboxEvent');
const ProcessedEvent = require('./models/ProcessedEvent');
const { runWithTenant } = require('./tenantContext');

const subscribers = new Map(); // type -> [{ consumer, handler }]

/**
 * Called by a producing module INSIDE the same DB transaction as its own
 * state change (see docs 2.5 - outbox pattern). Never fire-and-forget
 * in-memory only: if the process dies right after commit, the event row
 * is still there for the dispatcher to pick up.
 */
async function publish(type, companyId, payload, session) {
  await OutboxEvent.create([{ companyId, type, payload, status: 'pending' }], { session });
}

/**
 * Registers a handler for `type` under a stable `consumer` name. The
 * consumer name is the dedupe key alongside the event id (ProcessedEvent),
 * so renaming a consumer effectively resets its dedupe history - keep
 * these names stable once shipped.
 */
function subscribe(type, consumer, handler) {
  if (!subscribers.has(type)) subscribers.set(type, []);
  subscribers.get(type).push({ consumer, handler });
}

/**
 * Polls pending outbox rows and delivers them to every subscriber exactly
 * once each, using ProcessedEvent's unique index as the at-least-once ->
 * effectively-once guarantee. OutboxEvent/ProcessedEvent are plain system
 * collections (no tenantScoped plugin - a single dispatcher tick handles
 * events belonging to many companies), but each individual handler call is
 * rebound to that event's OWN company via runWithTenant, so the handler's
 * writes land correctly tenant-scoped and can never bleed across companies.
 */
async function dispatchPendingEvents(batchSize = 50) {
  const events = await OutboxEvent.find({ status: 'pending' }).limit(batchSize).sort({ createdAt: 1 });
  for (const event of events) {
    const handlers = subscribers.get(event.type) || [];
    for (const { consumer, handler } of handlers) {
      try {
        await ProcessedEvent.create({ eventId: event._id, consumer });
      } catch (err) {
        if (err.code === 11000) continue; // already processed by this consumer - skip silently
        throw err;
      }
      await runWithTenant(String(event.companyId), () => handler(event.payload, event));
    }
    event.status = 'dispatched';
    event.dispatchedAt = new Date();
    event.attempts += 1;
    await event.save();
  }
  return events.length;
}

module.exports = { publish, subscribe, dispatchPendingEvents, subscribers };
