import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import morgan from "morgan";

const VALID_REQUEST_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const CONTROL_CHARS_RE = /[\r\n\t\x00-\x1f\x7f]/g;
const SENSITIVE_QUERY_PARAM_RE =
  /^(token|access_token|password|secret|key|auth|jwt|cookie)$/i;

/** Strip control characters (including CR, LF, and TAB) to prevent log forging. */
export function stripControlChars(val: string): string {
  return val.replace(CONTROL_CHARS_RE, "");
}

/** Sanitize URL path and query string, redacting sensitive query parameter values. */
export function sanitizeUrl(originalUrl: string): string {
  const qIndex = originalUrl.indexOf("?");
  if (qIndex === -1) {
    return stripControlChars(originalUrl);
  }

  const pathPart = stripControlChars(originalUrl.slice(0, qIndex));
  const rawQuery = originalUrl.slice(qIndex + 1);
  if (!rawQuery) {
    return pathPart;
  }

  const sanitizedPairs = rawQuery.split("&").map((pair) => {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      return stripControlChars(pair);
    }

    const rawKey = pair.slice(0, eqIndex);
    let decodedKey = rawKey;
    try {
      decodedKey = decodeURIComponent(rawKey);
    } catch {
      // Keep raw key if malformed percent-encoding is sent.
    }

    const cleanKey = stripControlChars(rawKey);
    const cleanDecodedKey = stripControlChars(decodedKey).trim();
    if (SENSITIVE_QUERY_PARAM_RE.test(cleanDecodedKey)) {
      return `${cleanKey}=[REDACTED]`;
    }

    return `${cleanKey}=${stripControlChars(pair.slice(eqIndex + 1))}`;
  });

  return `${pathPart}?${sanitizedPairs.join("&")}`;
}

/** Correlate each request with a validated X-Request-Id or a freshly generated UUID. */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header("X-Request-Id")?.trim();
  const requestId =
    incoming && VALID_REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};

morgan.token("req-id", (req) => (req as Request).requestId ?? "-");

morgan.token("safe-url", (req) => {
  const expressReq = req as Request;
  return sanitizeUrl(expressReq.originalUrl || expressReq.url || "");
});

morgan.token("actor", (req) => {
  const user = (req as Request).user;
  if (!user) {
    return "ANON";
  }
  return `${user.role}:${user.organizationId ?? user.id}`;
});

const devFormatter = morgan.compile(
  "[:req-id] :method :safe-url :status :response-time ms | :actor"
);

const prodFormatter: morgan.FormatFn = (tokens, req, res) => {
  const statusRaw = tokens.status(req, res);
  const durationRaw = tokens["response-time"](req, res);
  const bytesRaw = tokens.res(req, res, "content-length");

  const statusNum = statusRaw ? Number.parseInt(statusRaw, 10) : 0;
  const durationNum = durationRaw ? Number.parseFloat(durationRaw) : 0;
  const bytesNum = bytesRaw ? Number.parseInt(bytesRaw, 10) : null;

  return JSON.stringify({
    ts: new Date().toISOString(),
    reqId: tokens["req-id"](req, res) ?? "-",
    method: stripControlChars(tokens.method(req, res) ?? ""),
    url: tokens["safe-url"](req, res) ?? "",
    status: Number.isFinite(statusNum) ? statusNum : 0,
    durationMs: Number.isFinite(durationNum) ? durationNum : 0,
    bytes: bytesNum !== null && Number.isFinite(bytesNum) ? bytesNum : null,
    actor: tokens.actor(req, res) ?? "ANON",
  });
};

/** Secure HTTP request logger emitting safe dev lines or production structured JSON. */
export const requestLoggerMiddleware: RequestHandler = morgan(
  (tokens, req, res) =>
    process.env.NODE_ENV === "production"
      ? prodFormatter(tokens, req, res)
      : devFormatter(tokens, req, res),
  {
    skip: () => process.env.NODE_ENV === "test",
  }
) as unknown as RequestHandler;
