import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { ZodError } from "zod";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const PG_ERROR_MAP: Record<
  string,
  { statusCode: number; code: string; message: string }
> = {
  "23505": {
    statusCode: 409,
    code: "CONFLICT",
    message: "Resource already exists",
  },
  "23514": {
    statusCode: 400,
    code: "CHECK_VIOLATION",
    message: "Request violates database constraint",
  },
  "23503": {
    statusCode: 400,
    code: "FOREIGN_KEY_VIOLATION",
    message: "Referenced resource does not exist",
  },
};

function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): void {
  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

function extractPgErrorCode(err: unknown): string | undefined {
  const candidate = err instanceof DrizzleQueryError ? err.cause : err;
  if (candidate instanceof DatabaseError) {
    return candidate.code;
  }

  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "code" in candidate &&
    typeof (candidate as { code?: unknown }).code === "string"
  ) {
    return (candidate as { code: string }).code;
  }

  return undefined;
}

const TRANSIENT_DB_CODES = new Set(["ETIMEDOUT", "ECONNRESET"]);
const TRANSIENT_DB_MESSAGES = [
  "Connection terminated due to connection timeout",
  "Connection terminated unexpectedly",
];

function isTransientDbConnectionError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === "object") {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && TRANSIENT_DB_CODES.has(code)) {
        return true;
      }

      const message = (current as { message?: unknown }).message;
      if (
        typeof message === "string" &&
        TRANSIENT_DB_MESSAGES.some((pattern) => message.includes(pattern))
      ) {
        return true;
      }

      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return false;
}

/** Return 404 JSON for unmatched /api/* endpoints. */
export const notFoundHandler: RequestHandler = (req, res) => {
  sendErrorResponse(
    res,
    404,
    "NOT_FOUND",
    `Route ${req.method} ${req.originalUrl} not found`
  );
};

/** Centralized Express error handler mapping domain, Zod, and PG errors. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    sendErrorResponse(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
    sendErrorResponse(
      res,
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      details
    );
    return;
  }

  if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as { status?: number }).status === 400 &&
    "body" in err
  ) {
    sendErrorResponse(res, 400, "INVALID_JSON", "Malformed JSON request body");
    return;
  }

  const pgCode = extractPgErrorCode(err);
  if (pgCode && pgCode in PG_ERROR_MAP) {
    const mapped = PG_ERROR_MAP[pgCode];
    sendErrorResponse(res, mapped.statusCode, mapped.code, mapped.message);
    return;
  }

  if (isTransientDbConnectionError(err)) {
    const summary = err instanceof Error ? err.message : String(err);
    console.warn(
      `[db] [reqId=${req.requestId ?? "-"}] transient connection error: ${summary}`
    );
    sendErrorResponse(
      res,
      503,
      "SERVICE_UNAVAILABLE",
      "تعذر الاتصال بقاعدة البيانات مؤقتاً؛ يرجى المحاولة مرة أخرى"
    );
    return;
  }

  console.error(
    `[error] [reqId=${req.requestId ?? "-"}] unexpected server error:`,
    err
  );

  const isProd = process.env.NODE_ENV === "production";
  const details =
    !isProd && err instanceof Error ? { stack: err.stack } : undefined;
  sendErrorResponse(
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    "Internal server error",
    details
  );
};
