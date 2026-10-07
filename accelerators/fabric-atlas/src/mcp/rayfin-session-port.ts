import { signInWithEntraToken } from "@microsoft/rayfin-auth-provider-fabric";
import { AuthError, NetworkError } from "@microsoft/rayfin-lib";
import type { AtlasRayfinClient } from "@/lib/rayfin-client";
import type { RayfinSessionPort } from "./app-audience-session";

type RayfinAuth = AtlasRayfinClient["auth"];

function refreshRejected(error: unknown): boolean {
  if (error instanceof AuthError) return true;
  return (
    error instanceof NetworkError &&
    (error.status === 400 || error.status === 401 || error.status === 403)
  );
}

/** Binds the session contract to the shared `RayfinClient` auth instance. */
export function rayfinSessionPort(
  auth: RayfinAuth,
  now: () => number = Date.now,
): RayfinSessionPort {
  const isAuthenticated = (): boolean => {
    const session = auth.getSession();
    return (
      session.isAuthenticated &&
      !session.isAnonymous &&
      (!session.expiresAt || session.expiresAt.getTime() > now())
    );
  };
  return {
    isAuthenticated,
    async refresh() {
      if (!auth.hasRefreshToken()) return false;
      try {
        await auth.refreshSession();
      } catch (error) {
        if (refreshRejected(error)) return false;
        throw error;
      }
      return isAuthenticated();
    },
    async exchange(entraToken) {
      await signInWithEntraToken(auth, { entraToken });
    },
  };
}
