//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { OpaqueSession } from "@microsoft/rayfin-auth";

import { IAuthService } from "@/services/rayfin-auth.service";
import { AuthContext, type AuthContextValue } from "./auth.context";

interface AuthProviderProps {
    children: ReactNode;
    rayfinAuthService: IAuthService;
}

/**
 * AuthProvider — runs the Fabric embedded auth handoff once on mount.
 *
 * Behavior:
 * - When loaded inside a Fabric iframe (`?fabricEmbedded=true`), calls
 *   `initEmbeddedAuth` to acquire a Rayfin session via postMessage.
 * - When loaded standalone, `initEmbeddedAuth` returns `null` immediately
 *   and the provider settles in an unauthenticated state and `<AuthGate>` 
 *   renders the "not embedded" notice.
 *
 * Consume the session with the `useAuth` hook.
 */
export function AuthProvider({ children, rayfinAuthService }: AuthProviderProps) {
    const [session, setSession] = useState<OpaqueSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;
        const unsubscribe = rayfinAuthService.onSessionChange((nextSession) => {
            if (!cancelled) setSession(nextSession);
        });

        (async () => {
            try {
                const result = await rayfinAuthService.initEmbeddedAuth();
                if (cancelled)
                    return;
                setSession(result);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [rayfinAuthService]);

    if (error)
        throw error;

    const value = useMemo<AuthContextValue>(
        () => ({
            session,
            isAuthenticated: session?.isAuthenticated ?? false,
            isLoading,
            error,
        }),
        [session, isLoading, error],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}