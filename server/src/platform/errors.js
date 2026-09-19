class DomainError extends Error {
  constructor(message, statusCode = 400, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationError extends DomainError {
  constructor(message, details) {
    super(message, 422, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ForbiddenError extends DomainError {
  constructor(message = 'Not authorized for this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ConflictError extends DomainError {
  constructor(message, code = 'CONFLICT') {
    super(message, 409, code);
  }
}

class PeriodLockedError extends ConflictError {
  constructor(message = 'Fiscal period is closed or locked for posting') {
    super(message, 'PERIOD_LOCKED');
  }
}

class UnbalancedEntryError extends DomainError {
  constructor(message = 'Journal entry debits and credits are not balanced') {
    super(message, 422, 'UNBALANCED_ENTRY');
  }
}

class DuplicatePostingError extends ConflictError {
  constructor(message = 'This source document has already been posted') {
    super(message, 'DUPLICATE_POSTING');
  }
}

// Express error-handling middleware. Registered last in app.js.
function errorMiddleware(err, req, res, _next) {
  if (err && err.code === 11000) {
    return res.status(409).json({
      error: { code: 'DUPLICATE_KEY', message: 'A record with the same unique key already exists.' },
    });
  }
  if (err instanceof DomainError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
}

module.exports = {
  DomainError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  PeriodLockedError,
  UnbalancedEntryError,
  DuplicatePostingError,
  errorMiddleware,
};
