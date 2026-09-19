const { ForbiddenError } = require('./errors');

/**
 * Data-driven role -> permission map (not a hardcoded switch per route).
 * A new role is a new entry here; no controller code changes.
 */
const ROLE_PERMISSIONS = {
  owner: ['*'],
  accountant: [
    'accounting:*',
  ],
  'fleet-manager': [
    'fleet:*',
  ],
  'hr-manager': [
    'hr:*',
  ],
  'payroll-admin': [
    'hr:payroll:*',
    'hr:employee:read',
  ],
  viewer: [
    'accounting:*:read',
    'fleet:*:read',
    'hr:*:read',
  ],
};

function expandPermissions(roles) {
  const perms = new Set();
  for (const role of roles) {
    for (const perm of ROLE_PERMISSIONS[role] || []) {
      perms.add(perm);
    }
  }
  return perms;
}

function matches(granted, required) {
  if (granted === '*') return true;
  const g = granted.split(':');
  const r = required.split(':');
  for (let i = 0; i < r.length; i += 1) {
    if (g[i] === '*') return true;
    if (g[i] !== r[i]) return false;
  }
  return g.length <= r.length;
}

function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    const roles = (req.context && req.context.roles) || [];
    const granted = expandPermissions(roles);
    const ok = [...granted].some((g) => matches(g, permission));
    if (!ok) {
      return next(new ForbiddenError(`Missing permission: ${permission}`));
    }
    return next();
  };
}

module.exports = { requirePermission, expandPermissions, ROLE_PERMISSIONS };
