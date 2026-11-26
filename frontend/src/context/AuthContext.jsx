import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ApiError,
  apiFetch,
  clearStoredToken,
  setStoredToken,
} from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrateSession = useCallback(async (signal) => {
    try {
      const { data } = await apiFetch("/api/auth/me", { signal });
      setUser(data?.user || null);
      setOrganization(data?.organization || null);
      return data;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }
      // Clear persisted credentials ONLY on explicit auth/verification rejection (401/403).
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        clearStoredToken();
        setUser(null);
        setOrganization(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    (async () => {
      await hydrateSession(controller.signal);
      if (mounted && !controller.signal.aborted) {
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [hydrateSession]);

  const refreshSession = useCallback(async () => {
    return hydrateSession();
  }, [hydrateSession]);

  const login = useCallback(async (email, password) => {
    const { data } = await apiFetch("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });

    if (data?.token) {
      setStoredToken(data.token);
    }

    const nextUser = data?.user || null;
    const nextOrg = data?.organization || null;
    setUser(nextUser);
    setOrganization(nextOrg);

    return { user: nextUser, organization: nextOrg };
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear local session state even if network request fails.
    } finally {
      clearStoredToken();
      setUser(null);
      setOrganization(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      organization,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshSession,
      setOrganization,
    }),
    [user, organization, loading, login, logout, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read current user session, organization metadata, and auth actions. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
