const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { authenticate } = require('./platform/auth');
const { bindTenantContext } = require('./platform/tenantMiddleware');
const { errorMiddleware } = require('./platform/errors');

const authRoutes = require('./modules/auth/routes');
const accountingRoutes = require('./modules/accounting/routes');
const fleetRoutes = require('./modules/fleet/routes');
const hrRoutes = require('./modules/hr/routes');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('tiny'));
  }

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);

  // Every route below this line requires a valid, company-scoped access
  // token, and runs inside the tenant async-context so the Mongoose plugin
  // (platform/tenantPlugin.js) can enforce isolation on every query.
  app.use('/api/accounting', authenticate, bindTenantContext, accountingRoutes);
  app.use('/api/fleet', authenticate, bindTenantContext, fleetRoutes);
  app.use('/api/hr', authenticate, bindTenantContext, hrRoutes);

  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorMiddleware);

  return app;
}

module.exports = { createApp };
