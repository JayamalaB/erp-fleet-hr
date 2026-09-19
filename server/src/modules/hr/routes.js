const express = require('express');
const { z } = require('zod');
const { requirePermission } = require('../../platform/rbac');
const { ValidationError, NotFoundError } = require('../../platform/errors');

const Employee = require('./models/Employee');
const Loan = require('./models/Loan');
const OvertimeRecord = require('./models/OvertimeRecord');
const LeaveType = require('./models/LeaveType');
const LeaveRequest = require('./models/LeaveRequest');
const PayrollRun = require('./models/PayrollRun');
const PayrollLine = require('./models/PayrollLine');
const EndOfServiceRecord = require('./models/EndOfServiceRecord');

const salaryService = require('./services/salaryService');
const leaveService = require('./services/leaveService');
const payrollService = require('./services/payrollService');
const terminationService = require('./services/terminationService');

const router = express.Router();

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(new ValidationError('Invalid request body', result.error.flatten()));
    req.body = result.data;
    return next();
  };
}

// ---------- Employees ----------
const employeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  joinDate: z.string().min(1),
  position: z.string().optional(),
  department: z.string().optional(),
});
router.post('/employees', requirePermission('hr:employee:write'), validate(employeeSchema), async (req, res, next) => {
  try {
    const employee = await Employee.create(req.body);
    res.status(201).json(employee);
  } catch (err) {
    next(err);
  }
});
router.get('/employees', requirePermission('hr:employee:read'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    res.json(await Employee.find(filter));
  } catch (err) {
    next(err);
  }
});
router.get('/employees/:id', requirePermission('hr:employee:read'), async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new NotFoundError('Employee not found');
    res.json(employee);
  } catch (err) {
    next(err);
  }
});

// ---------- Salary / Allowances / Deductions / Loans ----------
const salarySchema = z.object({ employeeId: z.string().min(1), basicSalary: z.number().nonnegative(), effectiveFrom: z.string().optional() });
router.post('/salary', requirePermission('hr:payroll:write'), validate(salarySchema), async (req, res, next) => {
  try {
    const body = { ...req.body, effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined };
    res.status(201).json(await salaryService.setSalary(body));
  } catch (err) {
    next(err);
  }
});

const allowanceDeductionSchema = z.object({
  employeeId: z.string().min(1),
  kind: z.enum(['allowance', 'deduction']),
  label: z.string().min(1),
  amount: z.number().nonnegative(),
  isRecurring: z.boolean().optional(),
  effectiveFrom: z.string().optional(),
});
router.post('/allowance-deductions', requirePermission('hr:payroll:write'), validate(allowanceDeductionSchema), async (req, res, next) => {
  try {
    const body = { ...req.body, effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined };
    res.status(201).json(await salaryService.addAllowanceOrDeduction(body));
  } catch (err) {
    next(err);
  }
});

const loanSchema = z.object({
  employeeId: z.string().min(1),
  principal: z.number().positive(),
  installmentAmount: z.number().positive(),
  startPeriod: z.string().min(1),
});
router.post('/loans', requirePermission('hr:payroll:write'), validate(loanSchema), async (req, res, next) => {
  try {
    const loan = await Loan.create({ ...req.body, remainingBalance: req.body.principal });
    res.status(201).json(loan);
  } catch (err) {
    next(err);
  }
});

const overtimeSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1),
  hours: z.number().positive(),
  rateMultiplier: z.number().positive().optional(),
});
router.post('/overtime', requirePermission('hr:payroll:write'), validate(overtimeSchema), async (req, res, next) => {
  try {
    res.status(201).json(await OvertimeRecord.create({ ...req.body, date: new Date(req.body.date) }));
  } catch (err) {
    next(err);
  }
});

// ---------- Leave ----------
router.post('/leave-types', requirePermission('hr:leave:write'), async (req, res, next) => {
  try {
    res.status(201).json(await LeaveType.create(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/leave-types', requirePermission('hr:leave:read'), async (req, res, next) => {
  try {
    res.json(await LeaveType.find());
  } catch (err) {
    next(err);
  }
});

const leaveRequestSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  days: z.number().positive(),
});
router.post('/leave-requests', requirePermission('hr:leave:write'), validate(leaveRequestSchema), async (req, res, next) => {
  try {
    const body = { ...req.body, from: new Date(req.body.from), to: new Date(req.body.to) };
    res.status(201).json(await leaveService.requestLeave(body));
  } catch (err) {
    next(err);
  }
});
router.post('/leave-requests/:id/approve', requirePermission('hr:leave:write'), async (req, res, next) => {
  try {
    res.json(await leaveService.approveLeave(req.params.id));
  } catch (err) {
    next(err);
  }
});
router.get('/employees/:id/leave-balance/:leaveTypeId', requirePermission('hr:leave:read'), async (req, res, next) => {
  try {
    const balance = await leaveService.getLeaveBalance(req.params.id, req.params.leaveTypeId);
    res.json({ employeeId: req.params.id, leaveTypeId: req.params.leaveTypeId, balance });
  } catch (err) {
    next(err);
  }
});
router.post('/leave/accrue', requirePermission('hr:leave:write'), async (req, res, next) => {
  try {
    const schema = z.object({ employeeId: z.string().min(1), leaveTypeId: z.string().min(1), periodLabel: z.string().min(1) });
    const { employeeId, leaveTypeId, periodLabel } = schema.parse(req.body);
    res.status(201).json(await leaveService.accrueMonthlyLeave(employeeId, leaveTypeId, periodLabel));
  } catch (err) {
    next(err);
  }
});

// ---------- Payroll Runs ----------
const payrollRunSchema = z.object({ periodLabel: z.string().min(1), periodStart: z.string().min(1), periodEnd: z.string().min(1) });
router.post('/payroll-runs', requirePermission('hr:payroll:write'), validate(payrollRunSchema), async (req, res, next) => {
  try {
    const run = await PayrollRun.create({
      periodLabel: req.body.periodLabel,
      periodStart: new Date(req.body.periodStart),
      periodEnd: new Date(req.body.periodEnd),
    });
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});
router.get('/payroll-runs', requirePermission('hr:payroll:read'), async (req, res, next) => {
  try {
    res.json(await PayrollRun.find().sort({ periodStart: 1 }));
  } catch (err) {
    next(err);
  }
});
router.post('/payroll-runs/:id/calculate', requirePermission('hr:payroll:write'), async (req, res, next) => {
  try {
    res.json(await payrollService.calculatePayrollForAllEmployees(req.params.id));
  } catch (err) {
    next(err);
  }
});
router.post('/payroll-runs/:id/employees/:employeeId/calculate', requirePermission('hr:payroll:write'), async (req, res, next) => {
  try {
    res.json(await payrollService.calculatePayrollLine(req.params.employeeId, req.params.id));
  } catch (err) {
    next(err);
  }
});
router.post('/payroll-runs/:id/lock', requirePermission('hr:payroll:write'), async (req, res, next) => {
  try {
    const run = await payrollService.transitionPayrollRun(req.params.id, 'locked');
    await payrollService.applyLoanInstallments(req.params.id);
    res.json(run);
  } catch (err) {
    next(err);
  }
});
router.post('/payroll-runs/:id/reopen', requirePermission('hr:payroll:write'), async (req, res, next) => {
  try {
    res.json(await payrollService.transitionPayrollRun(req.params.id, 'calculated'));
  } catch (err) {
    next(err);
  }
});
router.get('/payroll-runs/:id/lines', requirePermission('hr:payroll:read'), async (req, res, next) => {
  try {
    res.json(await PayrollLine.find({ payrollRunId: req.params.id }));
  } catch (err) {
    next(err);
  }
});

// ---------- Termination ----------
const terminationSchema = z.object({
  employeeId: z.string().min(1),
  terminationDate: z.string().min(1),
  terminationType: z.enum(['resignation', 'termination']),
});
router.post('/terminations', requirePermission('hr:employee:write'), validate(terminationSchema), async (req, res, next) => {
  try {
    res.status(201).json(await terminationService.terminateEmployee(req.body));
  } catch (err) {
    next(err);
  }
});
router.get('/employees/:id/end-of-service', requirePermission('hr:employee:read'), async (req, res, next) => {
  try {
    const record = await EndOfServiceRecord.findOne({ employeeId: req.params.id });
    if (!record) throw new NotFoundError('No end-of-service record for this employee');
    res.json(record);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
