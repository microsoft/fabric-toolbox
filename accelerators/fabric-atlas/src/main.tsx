//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from "react-error-boundary";
import { type ReactNode } from "react";

import App from './App.tsx';
import { ErrorFallback } from './ErrorFallback';
import { useAppTheme } from './hooks/use-theme';
import { ThemeContext } from './hooks/theme.context';
import { AuthProvider } from './hooks/use-auth';
import { useAuth } from './hooks/auth.context';
import { bootstrapAuth, type IAuthService } from './services/rayfin-auth.service';
import { AuthGate } from './components/auth-gate.component';
import { AtlasProvider } from './atlas/store';

import "./global.css"

let rayfinAuthService: IAuthService | null = null;
const previewMode =
    import.meta.env.VITE_RAYFIN_ATLAS_DEMO_MODE === "true";
let bootstrapError: Error | null = null;
if (!previewMode) {
    try {
        rayfinAuthService = bootstrapAuth();
    } catch (error) {
        bootstrapError = new Error(
            `Fabric Atlas authentication is not configured: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

function ThemeShell({ children }: { children: ReactNode }) {
    const { isDark, toggleTheme } = useAppTheme();
    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

// This private shell is intentionally colocated with the root auth composition.
// eslint-disable-next-line react-refresh/only-export-components
function AuthenticatedAtlas() {
    const { session } = useAuth();
    const user = session?.user;
    if (!user) return null;
    return (
        <AtlasProvider
            isPreview={false}
            currentUser={{
                id: user.id,
                name: user.email,
                email: user.email,
            }}
        >
            <App />
        </AtlasProvider>
    );
}

function Root() {
    if (bootstrapError) {
        return (
            <ThemeShell>
                <ErrorFallback
                    error={bootstrapError}
                    resetErrorBoundary={() => window.location.reload()}
                />
            </ThemeShell>
        );
    }
    if (previewMode) {
        return (
            <ThemeShell>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <AtlasProvider isPreview>
                        <App />
                    </AtlasProvider>
                </ErrorBoundary>
            </ThemeShell>
        );
    }
    if (!rayfinAuthService) return null;

    return (
        <ThemeShell>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <AuthProvider rayfinAuthService={rayfinAuthService}>
                    <AuthGate>
                        <AuthenticatedAtlas />
                    </AuthGate>
                </AuthProvider>
            </ErrorBoundary>
        </ThemeShell>
    );
}

createRoot(document.getElementById('root')!).render(<Root />)
