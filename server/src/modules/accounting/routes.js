const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { requirePermission } = require('../../platform/rbac');
const { ValidationError } = require('../../platform/errors');
const { getCurrentCompanyId } = require('../../platform/tenantContext');

const Account = require('./models/Account');
const FiscalPeriod = require('./models/FiscalPeriod');
const Party = require('./models/Party');
const Invoice = require('./models/Invoice');
const Settlement = require('./models/Settlement');

const coaService = require('./services/coaService');
const fiscalPeriodService = require('./services/fiscalPeriodService');
const invoiceService = require('./services/invoiceService');
const settlementService = require('./services/settlementService');
const reportService = require('./services/reportService');

const router = express.Router();

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(new ValidationError('Invalid request body', result.error.flatten()));
    req.body = result.data;
    return next();
  };
}

// ---------- Setup ----------
router.post('/setup/seed-chart-of-accounts', requirePermission('accounting:setup:write'), async (req, res, next) => {
  try {
    const companyId = getCurrentCompanyId();
    const accounts = await coaService.seedDefaultChartOfAccounts(new mongoose.Types.ObjectId(companyId));
    res.status(201).json(accounts);
  } catch (err) {
    next(err);
  }
});

router.get('/accounts', requirePermission('accounting:account:read'), async (req, res, next) => {
  try {
    res.json(await Account.find().sort({ code: 1 }));
  } catch (err) {
    next(err);
  }
});

// ---------- Fiscal Periods ----------
const fiscalPeriodSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().datetime().or(z.string().min(1)),
  endDate: z.string().datetime().or(z.string().min(1)),
});

router.post('/fiscal-periods', requirePermission('accounting:period:write'), validate(fiscalPeriodSchema), async (req, res, next) => {
  try {
    const period = await fiscalPeriodService.createFiscalPeriod(req.body);
    res.status(201).json(period);
  } catch (err) {
    next(err);
  }
});

router.get('/fiscal-periods', requirePermission('accounting:period:read'), async (req, res, next) => {
  try {
    res.json(await FiscalPeriod.find().sort({ startDate: 1 }));
  } catch (err) {
    next(err);
  }
});

router.post('/fiscal-periods/:id/close', requirePermission('accounting:period:write'), async (req, res, next) => {
  try {
    res.json(await fiscalPeriodService.transitionPeriod(req.params.id, 'closed', req.context.userId));
  } catch (err) {
    next(err);
  }
});

router.post('/fiscal-periods/:id/lock', requirePermission('accounting:period:write'), async (req, res, next) => {
  try {
    res.json(await fiscalPeriodService.transitionPeriod(req.params.id, 'locked', req.context.userId));
  } catch (err) {
    next(err);
  }
});

// ---------- Customers / Suppliers ----------
const partySchema = z.object({
  kind: z.enum(['customer', 'supplier']),
  name: z.string().min(1),
  taxNo: z.string().optional(),
  paymentTermsDays: z.number().int().nonnegative().optional(),
});

router.post('/parties', requirePermission('accounting:party:write'), validate(partySchema), async (req, res, next) => {
  try {
    res.status(201).json(await Party.create(req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/parties', requirePermission('accounting:party:read'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.kind) filter.kind = req.query.kind;
    res.json(await Party.find(filter).sort({ name: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/parties/:id/balance', requirePermission('accounting:party:read'), async (req, res, next) => {
  try {
    res.json(await reportService.partyBalance(req.params.id));
  } catch (err) {
    next(err);
  }
});

// ---------- Invoices ----------
const invoiceLineSchema = z.object({ description: z.string().min(1), amount: z.number().positive() });
const createInvoiceSchema = z.object({
  kind: z.enum(['sales', 'purchase']),
  partyId: z.string().min(1),
  fiscalPeriodId: z.string().min(1),
  invoiceNo: z.string().min(1),
  lines: z.array(invoiceLineSchema).min(1),
  vatRate: z.number().min(0).max(1),
});

router.post('/invoices', requirePermission('accounting:invoice:write'), validate(createInvoiceSchema), async (req, res, next) => {
  try {
    res.status(201).json(await invoiceService.createInvoice(req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/invoices', requirePermission('accounting:invoice:read'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.partyId) filter.partyId = req.query.partyId;
    res.json(await Invoice.find(filter).sort({ createdAt: -1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/invoices/:id', requirePermission('accounting:invoice:read'), async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    res.json(invoice);
  } catch (err) {
    next(err);
  }
});

router.post('/invoices/:id/post', requirePermission('accounting:invoice:post'), async (req, res, next) => {
  try {
    res.json(await invoiceService.postInvoice(req.params.id, { postedByUserId: req.context.userId }));
  } catch (err) {
    next(err);
  }
});

router.post('/invoices/:id/cancel', requirePermission('accounting:invoice:write'), async (req, res, next) => {
  try {
    res.json(await invoiceService.cancelInvoice(req.params.id, { actorUserId: req.context.userId }));
  } catch (err) {
    next(err);
  }
});

// ---------- Receipts / Payments (Settlements) ----------
const allocationSchema = z.object({ invoiceId: z.string().min(1), amountApplied: z.number().positive() });
const settlementSchema = z.object({
  kind: z.enum(['receipt', 'payment']),
  partyId: z.string().min(1),
  fiscalPeriodId: z.string().min(1),
  amount: z.number().positive(),
  allocations: z.array(allocationSchema).min(1),
  method: z.enum(['cash', 'bank_transfer', 'card', 'cheque']).optional(),
});

router.post('/settlements', requirePermission('accounting:settlement:write'), validate(settlementSchema), async (req, res, next) => {
  try {
    res.status(201).json(await settlementService.createAndPostSettlement({ ...req.body, actorUserId: req.context.userId }));
  } catch (err) {
    next(err);
  }
});

router.get('/settlements', requirePermission('accounting:settlement:read'), async (req, res, next) => {
  try {
    res.json(await Settlement.find().sort({ createdAt: -1 }));
  } catch (err) {
    next(err);
  }
});

// ---------- Reports ----------
router.get('/reports/trial-balance', requirePermission('accounting:report:read'), async (req, res, next) => {
  try {
    res.json(await reportService.trialBalance(req.query.fiscalPeriodId));
  } catch (err) {
    next(err);
  }
});

router.get('/reports/profit-and-loss', requirePermission('accounting:report:read'), async (req, res, next) => {
  try {
    res.json(await reportService.profitAndLoss(req.query.fiscalPeriodId));
  } catch (err) {
    next(err);
  }
});

router.get('/reports/balance-sheet', requirePermission('accounting:report:read'), async (req, res, next) => {
  try {
    res.json(await reportService.balanceSheet(req.query.asOfDate || new Date().toISOString()));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
