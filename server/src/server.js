require('dotenv').config();
const cron = require('node-cron');
const { createApp } = require('./app');
const { connectDB } = require('./platform/db');
const { dispatchPendingEvents } = require('./platform/eventBus');
const { runDocumentExpiryCheck } = require('./modules/fleet/jobs/documentExpiryJob');
require('./modules/accounting/eventHandlers'); // registers this module's subscribers as a side effect
require('./modules/fleet/eventHandlers');
require('./modules/hr/eventHandlers');

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB(process.env.MONGODB_URI);
  // eslint-disable-next-line no-console
  console.log('Connected to MongoDB');

  const app = createApp();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT}`);
  });

  // Outbox dispatcher: polls for pending domain events and delivers them to
  // subscribers (docs 2.5). A crashed/restarted process simply resumes
  // where the outbox left off - nothing in-flight is lost.
  setInterval(() => {
    dispatchPendingEvents().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Event dispatch error:', err);
    });
  }, 2000);

  // Daily document-expiry alert scan (docs 4.5), 06:00 server time.
  cron.schedule('0 6 * * *', () => {
    runDocumentExpiryCheck().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Document expiry check error:', err);
    });
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
