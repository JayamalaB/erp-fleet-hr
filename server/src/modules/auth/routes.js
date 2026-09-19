const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../../platform/models/User');
const Company = require('../../platform/models/Company');
const Membership = require('../../platform/models/Membership');
const { signAccessToken } = require('../../platform/auth');
const { ValidationError, UnauthorizedError, ForbiddenError } = require('../../platform/errors');
const { runAsSystem } = require('../../platform/tenantContext');

const router = express.Router();

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(new ValidationError('Invalid request body', result.error.flatten()));
    req.body = result.data;
    return next();
  };
}

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(1),
});

// Registering creates the user's first Company (as owner) - the simplest
// bootstrap path for a brand-new tenant. Joining an existing company is a
// separate, invite-based flow (out of scope for this assessment).
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, companyName } = req.body;
    const existing = await User.findOne({ email });
    if (existing) throw new ValidationError('An account with this email already exists');

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, passwordHash });
    const company = await Company.create({ name: companyName });
    await Membership.create({ userId: user._id, companyId: company._id, roles: ['owner'] });

    return res.status(201).json({ userId: user._id, companyId: company._id });
  } catch (err) {
    return next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Step 1 of login: verify credentials, return the list of companies this
// user belongs to plus a short-lived pre-auth token (not yet scoped to any
// company - carries no permissions on its own).
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.verifyPassword(password))) {
      throw new UnauthorizedError('Invalid email or password');
    }
    const memberships = await Membership.find({ userId: user._id }).populate('companyId', 'name');
    const preAuthToken = jwt.sign({ sub: String(user._id), type: 'pre-auth' }, process.env.JWT_ACCESS_SECRET, {
      expiresIn: '10m',
    });
    return res.json({
      preAuthToken,
      companies: memberships.map((m) => ({
        companyId: m.companyId._id,
        companyName: m.companyId.name,
        roles: m.roles,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

const selectCompanySchema = z.object({ companyId: z.string().min(1) });

// Step 2 of login: exchange the pre-auth token + a chosen companyId for a
// real, company-scoped access token. This is the only place companyId
// enters a JWT, and it is verified against Membership first - a user can
// never mint a token for a company they don't belong to.
router.post('/select-company', validate(selectCompanySchema), async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token) throw new UnauthorizedError('Missing pre-auth token');
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch {
      throw new UnauthorizedError('Invalid or expired pre-auth token');
    }
    if (payload.type !== 'pre-auth') throw new UnauthorizedError('Wrong token type');

    const membership = await runAsSystem(() =>
      Membership.findOne({ userId: payload.sub, companyId: req.body.companyId })
    );
    if (!membership) throw new ForbiddenError('You are not a member of this company');

    const accessToken = signAccessToken({
      userId: payload.sub,
      companyId: String(req.body.companyId),
      roles: membership.roles,
    });
    return res.json({ accessToken });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
