import { apiFetch } from "../../lib/api";

/** List all organizations (with optional status/type query filters) and primary user summaries. */
export async function fetchAdminOrganizations(query = {}, { signal } = {}) {
  const { data } = await apiFetch("/api/admin/organizations", {
    query,
    signal,
  });
  return data?.organizations || [];
}

/** Onboard a new licensed pharmacy or distributor organization with its initial user account. */
export async function createAdminOrganization(payload) {
  const { data } = await apiFetch("/api/admin/organizations", {
    method: "POST",
    body: payload,
  });
  return data;
}

/** Transition an organization's verification status (PENDING | VERIFIED | SUSPENDED). */
export async function verifyAdminOrganization(id, payload) {
  const { data } = await apiFetch(`/api/admin/organizations/${id}/verify`, {
    method: "PATCH",
    body: payload,
  });
  return data;
}
