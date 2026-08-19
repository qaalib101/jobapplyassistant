/**
 * Base application error class with HTTP status code support.
 * All custom errors should extend this class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = "INTERNAL_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 404, "NOT_FOUND");
  }
}

/**
 * Thrown when request validation fails.
 */
export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

/**
 * Thrown when the database is unreachable or a query fails.
 */
export class DatabaseError extends AppError {
  constructor(message: string = "Database connection failed", public readonly cause?: unknown) {
    super(message, 503, "DATABASE_ERROR");
    this.isOperational = true;
  }
}

/**
 * Thrown when an AI provider is unavailable or fails.
 */
export class AIProviderError extends AppError {
  constructor(message: string = "AI provider error", public readonly provider?: string) {
    super(message, 502, "AI_PROVIDER_ERROR");
  }
}

/**
 * Thrown when a request is not authorized.
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/**
 * Thrown when a request is forbidden.
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

/**
 * Thrown when a request conflicts with the current state (e.g., duplicate).
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * Thrown when too many requests are made.
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}