import cors from "cors";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { config } from "./config";
import { router } from "./routes";
import logger, { logApiRequest } from "./logger";
import { AppError } from "./errors";

const app = express();

// Middleware for request logging
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Generate unique request ID for each request
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  (req as express.Request & { requestId: string }).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

// Request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logApiRequest({
      requestId: (req as express.Request & { requestId: string }).requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin.startsWith("chrome-extension://")) {
        callback(null, true);
        return;
      }
      if (config.extensionOrigin && origin === config.extensionOrigin) {
        callback(null, true);
        return;
      }
      if (origin === config.publicBaseUrl) {
        callback(null, true);
        return;
      }
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }
      if (/^https?:\/\/jobapply\.localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed: ${origin}`));
    },
  }),
);

app.use("/api", router);

const frontendDist = path.resolve(process.cwd(), "dist/apps/frontend");
const frontendSource = path.resolve(process.cwd(), "apps/frontend/public");

/**
 * Classify Prisma errors into user-friendly messages.
 */
function classifyPrismaError(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case "P1001":
    case "P1002":
    case "P1003":
    case "P1008":
    case "P1009":
    case "P1010":
    case "P1011":
    case "P1012":
    case "P1013":
    case "P1014":
    case "P1015":
    case "P1016":
    case "P1017":
      return {
        statusCode: 503,
        code: "DATABASE_UNAVAILABLE",
        message: "The database is currently unavailable. Please try again later.",
      };
    case "P2002":
      return {
        statusCode: 409,
        code: "DUPLICATE_ENTRY",
        message: "A record with this data already exists.",
      };
    case "P2003":
      return {
        statusCode: 400,
        code: "FOREIGN_KEY_VIOLATION",
        message: "Referenced record does not exist.",
      };
    case "P2025":
      return {
        statusCode: 404,
        code: "RECORD_NOT_FOUND",
        message: "The requested record was not found.",
      };
    case "P2000":
      return {
        statusCode: 400,
        code: "VALUE_TOO_LONG",
        message: "A provided value is too long.",
      };
    case "P2001":
      return {
        statusCode: 400,
        code: "RECORD_DOES_NOT_EXIST",
        message: "The record referenced in the query does not exist.",
      };
    case "P2006":
      return {
        statusCode: 400,
        code: "INVALID_VALUE",
        message: "A provided value is invalid for this field.",
      };
    case "P2011":
      return {
        statusCode: 400,
        code: "NULL_CONSTRAINT_VIOLATION",
        message: "A required field was not provided.",
      };
    case "P2012":
      return {
        statusCode: 400,
        code: "MISSING_REQUIRED_VALUE",
        message: "A required value is missing.",
      };
    case "P2014":
      return {
        statusCode: 400,
        code: "RELATION_VIOLATION",
        message: "The operation would violate a relation between records.",
      };
    case "P2021":
    case "P2022":
      return {
        statusCode: 500,
        code: "DATABASE_SCHEMA_ERROR",
        message: "An internal database configuration error occurred.",
      };
    default:
      return {
        statusCode: 500,
        code: "DATABASE_ERROR",
        message: "An unexpected database error occurred.",
      };
  }
}

/**
 * Global error handling middleware.
 * Logs errors with full context and returns user-friendly responses.
 */
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const requestId = (req as express.Request & { requestId: string }).requestId;
    const requestMeta = {
      requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
    };

    // Handle AppError (our custom errors)
    if (error instanceof AppError) {
      logger.warn(`${error.name}: ${error.message}`, {
        ...requestMeta,
        statusCode: error.statusCode,
        code: error.code,
      });

      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof Error && "details" in error && error.details
            ? { details: error.details }
            : {}),
        },
      });
      return;
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));

      logger.warn("Validation error", {
        ...requestMeta,
        statusCode: 400,
        code: "VALIDATION_ERROR",
        issues,
      });

      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: issues,
        },
      });
      return;
    }

    // Handle Prisma known request errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const classified = classifyPrismaError(error);

      logger.error(`Prisma error [${error.code}]: ${error.message}`, {
        ...requestMeta,
        statusCode: classified.statusCode,
        code: classified.code,
        prismaCode: error.code,
        prismaMeta: error.meta,
      });

      res.status(classified.statusCode).json({
        error: {
          code: classified.code,
          message: classified.message,
        },
      });
      return;
    }

    // Handle Prisma client initialization errors (e.g., can't reach DB)
    if (error instanceof Prisma.PrismaClientInitializationError) {
      logger.error(`Prisma initialization error: ${error.message}`, {
        ...requestMeta,
        statusCode: 503,
        code: "DATABASE_UNAVAILABLE",
        errorCode: error.errorCode,
      });

      res.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is currently unavailable. Please try again later.",
        },
      });
      return;
    }

    // Handle Prisma client engine errors
    if (error instanceof Prisma.PrismaClientRustPanicError) {
      logger.error(`Prisma engine panic: ${error.message}`, {
        ...requestMeta,
        statusCode: 500,
        code: "DATABASE_ENGINE_ERROR",
      });

      res.status(500).json({
        error: {
          code: "DATABASE_ENGINE_ERROR",
          message: "An internal database error occurred. Please try again later.",
        },
      });
      return;
    }

    // Handle Prisma client validation errors
    if (error instanceof Prisma.PrismaClientValidationError) {
      logger.error(`Prisma validation error: ${error.message}`, {
        ...requestMeta,
        statusCode: 500,
        code: "DATABASE_QUERY_ERROR",
      });

      res.status(500).json({
        error: {
          code: "DATABASE_QUERY_ERROR",
          message: "An internal error occurred while processing the request.",
        },
      });
      return;
    }

    // Handle generic errors
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error(`Unhandled error: ${message}`, {
      ...requestMeta,
      statusCode: 500,
      code: "INTERNAL_ERROR",
      stack,
    });

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  },
);

// Handle 404 for API routes
app.use("/api/*", (req, res) => {
  logger.warn("API route not found", {
    method: req.method,
    path: req.path,
  });
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `API route ${req.method} ${req.path} not found.`,
    },
  });
});

app.use(express.static(frontendDist));
app.use(express.static(frontendSource));
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`, {
    environment: process.env.NODE_ENV ?? "development",
    databaseUrl: config.databaseUrl.replace(/:([^@]+)@/, ":***@"), // Redact password
  });
});

export { app };
