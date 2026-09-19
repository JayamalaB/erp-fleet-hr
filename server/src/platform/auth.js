const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('./errors');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

function signAccessToken({ userId, companyId, roles }) {
  return jwt.sign({ sub: userId, companyId, roles }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function signRefreshToken({ userId }) {
  return jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

/**
 * Populates req.context from the verified access token.
 * req.context.companyId is the ONLY source of tenant scope used anywhere
 * downstream (models/tenantPlugin.js) - never req.body/query.companyId.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.context = {
      userId: payload.sub,
      companyId: payload.companyId,
      roles: payload.roles || [],
    };
    return next();
  } catch (err) {
    return next(new UnauthorizedError('Invalid or expired access token'));
  }
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  authenticate,
};
