//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

export const ErrorFallback = ({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) => {
    const message = error instanceof Error ? error.message : String(error);

    // Log to the console so DevTools shows the full stack regardless of
    // environment. The styled fallback below is what users see.
    if (import.meta.env.DEV) console.error("[ErrorBoundary]", error);

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="atlas-narrow-panel w-full text-center">
                <h2 className="mb-2 text-lg font-semibold text-foreground">Something went wrong</h2>
                <pre className="mb-4 max-h-32 overflow-auto rounded border border-border bg-muted p-3 text-left text-sm text-muted-foreground">
                    {message}
                </pre>
                <button
                    onClick={resetErrorBoundary}
                    className="rounded border border-border px-4 py-2 text-sm text-foreground hover:bg-accent"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
}
