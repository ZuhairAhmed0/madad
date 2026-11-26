const CATALOG_CACHE_PREFIX = "madad_catalog_snapshot";

function buildStorageKey(pharmacyId, queryKey) {
  return `${CATALOG_CACHE_PREFIX}:${pharmacyId || "anon"}:${queryKey || "default"}`;
}

/** Persist a pharmacy catalog snapshot locally with timestamp for fallback display. */
export function saveCatalogSnapshot(pharmacyId, queryKey, payload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const key = buildStorageKey(pharmacyId, queryKey);
    const entry = {
      payload,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage quota or private browsing errors gracefully.
  }
}

/** Load a previously saved catalog snapshot or return null when unavailable. */
export function loadCatalogSnapshot(pharmacyId, queryKey) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      buildStorageKey(pharmacyId, queryKey)
    );
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("payload" in parsed)) {
      return null;
    }

    return {
      payload: parsed.payload,
      savedAt: parsed.savedAt || null,
    };
  } catch {
    return null;
  }
}
