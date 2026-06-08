/**
 * Typed error classes so route handlers can throw and the global error
 * middleware renders a clean JSON response with the right status code.
 */

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, 'bad_request', message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Not authenticated') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Not authorized') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, 'conflict', message);
  }
}

export class InternalError extends HttpError {
  constructor(message = 'Internal server error') {
    super(500, 'internal', message);
  }
}
