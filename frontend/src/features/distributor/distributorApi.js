import { apiFetch } from "../../lib/api";

/** Update distributor sales status and/or default order confirmation window. */
export async function updateDistributorStatus(payload) {
  const { data } = await apiFetch("/api/distributor/status", {
    method: "PATCH",
    body: payload,
  });
  return data;
}

/** List listings owned by the authenticated distributor with optional filters. */
export async function fetchDistributorListings(query = {}, { signal } = {}) {
  const { data } = await apiFetch("/api/distributor/listings", {
    query,
    signal,
  });
  return data?.listings || [];
}

/** Create a new distributor listing for an active master drug. */
export async function createDistributorListing(payload) {
  const { data } = await apiFetch("/api/distributor/listings", {
    method: "POST",
    body: payload,
  });
  return data;
}

/** Update wholesale price and/or availability for an owned distributor listing. */
export async function updateDistributorListing(id, payload) {
  const { data } = await apiFetch(`/api/distributor/listings/${id}`, {
    method: "PATCH",
    body: payload,
  });
  return data;
}

/** Atomically reprice all active-drug listings of a manufacturer inside PostgreSQL. */
export async function applyBulkPercentPricing(payload) {
  const { data } = await apiFetch("/api/distributor/pricing/bulk-percent", {
    method: "POST",
    body: payload,
  });
  return data;
}

/** Bulk import CSV / Excel / WhatsApp text rows into the distributor catalog. */
export async function bulkImportListings(payload) {
  const { data } = await apiFetch("/api/distributor/listings/bulk-import", {
    method: "POST",
    body: payload,
  });
  return data;
}

/** Fetch saved one-time drug name aliases owned by the distributor. */
export async function fetchDistributorAliases() {
  const { data } = await apiFetch("/api/distributor/aliases");
  return data?.aliases || [];
}

/** Upsert a one-time drug alias and optionally upsert the listing price atomically. */
export async function upsertDistributorAlias(payload) {
  const { data } = await apiFetch("/api/distributor/aliases", {
    method: "POST",
    body: payload,
  });
  return data;
}

/** Fetch recent price audit logs owned by the distributor. */
export async function fetchPriceLogs(limit = 30) {
  const { data } = await apiFetch("/api/distributor/price-logs", {
    query: { limit },
  });
  return data?.logs || [];
}

/** List verified pharmacies ordered newest-verified first with optional region search. */
export async function fetchNewPharmacies(region, { signal } = {}) {
  const { data } = await apiFetch("/api/distributor/new-pharmacies", {
    ...(region ? { query: { region } } : {}),
    signal,
  });
  return data?.pharmacies || [];
}

/** List price access permissions scoped to the authenticated distributor. */
export async function fetchDistributorPermissions(status, { signal } = {}) {
  const { data } = await apiFetch("/api/permissions", {
    ...(status ? { query: { status } } : {}),
    signal,
  });
  return data?.permissions || [];
}

/** Approve or revoke a pharmacy's price access permission. */
export async function updatePermissionStatus(id, status) {
  const { data } = await apiFetch(`/api/permissions/${id}`, {
    method: "PATCH",
    body: { status },
  });
  return data;
}

/** List incoming B2B orders addressed to the authenticated distributor. */
export async function fetchDistributorOrders(status, { signal } = {}) {
  const { data } = await apiFetch("/api/orders", {
    ...(status ? { query: { status } } : {}),
    signal,
  });
  return data?.orders || [];
}

/** Confirm a pending incoming order (or trigger server Commit-Before-Throw expiry check). */
export async function confirmDistributorOrder(id) {
  const { data } = await apiFetch(`/api/orders/${id}/confirm`, {
    method: "PATCH",
  });
  return data;
}

/** Cancel a pending incoming order as the distributor. */
export async function cancelDistributorOrder(id) {
  const { data } = await apiFetch(`/api/orders/${id}/cancel`, {
    method: "PATCH",
  });
  return data;
}

/** List sorted active drug manufacturers from the master catalog. */
export async function fetchManufacturers() {
  const { data } = await apiFetch("/api/catalog/manufacturers");
  return data?.manufacturers || [];
}

/** Search active master drugs for manual listing creation or alias mapping. */
export async function fetchMasterDrugs(query = {}, { signal } = {}) {
  const { data } = await apiFetch("/api/catalog/master-drugs", {
    query,
    signal,
  });
  return data?.drugs || [];
}
