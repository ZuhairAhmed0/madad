const rawApiUrl = import.meta.env.VITE_API_URL;
export const API_BASE_URL = (
  rawApiUrl !== undefined ? rawApiUrl.trim() : "http://localhost:4000"
).replace(/\/+$/, "");

const AUTH_TOKEN_STORAGE_KEY = "madad_auth_token";

/** Read the persisted JWT bearer token safely. */
export function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    return token && token.trim().length > 0 ? token.trim() : null;
  } catch {
    return null;
  }
}

/** Persist the JWT bearer token in localStorage cleanly. */
export function setStoredToken(token) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (token && String(token).trim().length > 0) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, String(token).trim());
    }
  } catch {
    // Ignore storage quota or privacy-mode restrictions gracefully.
  }
}

/** Remove any stored JWT bearer token from localStorage. */
export function clearStoredToken() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore restricted storage errors gracefully.
  }
}

/** Structured API error exposing HTTP status, machine error code, details, and request correlation ID. */
export class ApiError extends Error {
  constructor(
    message,
    { status = 0, code = "HTTP_ERROR", details = null, requestId = null } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function buildRequestUrl(path, query) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = `${API_BASE_URL}${normalizedPath}`;

  if (!query || typeof query !== "object") {
    return baseUrl;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/** Perform an authenticated JSON API request with normalized error handling. */
export async function apiFetch(path, options = {}) {
  const { method = "GET", body, headers: customHeaders, query, signal } = options;
  const url = buildRequestUrl(path, query);
  const headers = { ...(customHeaders || {}) };

  const token = getStoredToken();
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let serializedBody;
  if (body !== undefined) {
    if (body instanceof FormData || typeof body === "string") {
      serializedBody = body;
    } else {
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
      serializedBody = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: serializedBody,
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError("تعذر الاتصال بالخادم؛ تحقق من اتصال الإنترنت", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  const requestId = response.headers.get("X-Request-Id") || null;

  let data = null;
  try {
    const rawText = await response.text();
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(data?.error?.message || "حدث خطأ غير متوقع", {
      status: response.status,
      code: data?.error?.code || "HTTP_ERROR",
      details: data?.error?.details || null,
      requestId,
    });
  }

  return {
    data,
    status: response.status,
    requestId,
  };
}
