import { apiFetch } from "../../lib/api";

/** Search active catalog listings for the authenticated pharmacy. */
export async function fetchCatalog(query = {}, { signal } = {}) {
  const { data } = await apiFetch("/api/catalog", { query, signal });
  return data;
}

/** List sorted active drug manufacturers for catalog filtering. */
export async function fetchManufacturers() {
  const { data } = await apiFetch("/api/catalog/manufacturers");
  return data?.manufacturers || [];
}

/** Search active master drugs for watchlist creation. */
export async function fetchMasterDrugs(query = {}, { signal } = {}) {
  const { data } = await apiFetch("/api/catalog/master-drugs", {
    query,
    signal,
  });
  return data?.drugs || [];
}

/** List verified distributors with active listing counts and permission status. */
export async function fetchDistributors({ signal } = {}) {
  const { data } = await apiFetch("/api/distributors", { signal });
  return data?.distributors || [];
}

/** Fetch a verified distributor's profile, permission status, and masked listings. */
export async function fetchDistributorDetail(id, { signal } = {}) {
  const { data } = await apiFetch(`/api/distributors/${id}`, { signal });
  return data;
}

/** Request or re-request wholesale price access from a verified distributor. */
export async function requestPriceAccess(distributorId) {
  const { data } = await apiFetch("/api/permissions/request", {
    method: "POST",
    body: { distributorId },
  });
  return data;
}

/** Load the pharmacy's watched drugs and server-computed alert metrics. */
export async function fetchWatchlist({ signal } = {}) {
  const { data } = await apiFetch("/api/watchlist", { signal });
  return data;
}

/** Load recent authorized price change logs (all or watched drugs only). */
export async function fetchPriceAlerts(
  { limit = 30, watchedOnly = false } = {},
  { signal } = {}
) {
  const { data } = await apiFetch("/api/watchlist/price-alerts", {
    query: { limit, watchedOnly },
    signal,
  });
  return data?.alerts || [];
}

/** Add a drug to the pharmacy watchlist. */
export async function addWatchlistItem(payload) {
  const { data } = await apiFetch("/api/watchlist", {
    method: "POST",
    body: payload,
  });
  return data;
}

/** Update pricing policy, margin, auto-calc, or manual shelf price on a watched item. */
export async function updateWatchlistItem(id, payload) {
  const { data } = await apiFetch(`/api/watchlist/${id}`, {
    method: "PATCH",
    body: payload,
  });
  return data;
}

/** Acknowledge the latest authorized wholesale price and update shelf price. */
export async function acknowledgeWatchlistItem(id, payload = {}) {
  const { data } = await apiFetch(`/api/watchlist/${id}/acknowledge`, {
    method: "POST",
    body: payload,
  });
  return data;
}

/** Remove an item from the pharmacy watchlist. */
export async function deleteWatchlistItem(id) {
  const { data } = await apiFetch(`/api/watchlist/${id}`, {
    method: "DELETE",
  });
  return data;
}

/** Submit a new B2B order using a caller-supplied Idempotency-Key header. */
export async function createOrder(payload, idempotencyKey) {
  const { data } = await apiFetch("/api/orders", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: payload,
  });
  return data;
}

/** List orders placed by the authenticated pharmacy with optional status filter. */
export async function fetchOrders(status, { signal } = {}) {
  const { data } = await apiFetch("/api/orders", {
    ...(status ? { query: { status } } : {}),
    signal,
  });
  return data?.orders || [];
}

/** Cancel a pending order before confirmation or expiry. */
export async function cancelOrder(id) {
  const { data } = await apiFetch(`/api/orders/${id}/cancel`, {
    method: "PATCH",
  });
  return data;
}
