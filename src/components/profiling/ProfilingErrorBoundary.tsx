/**
 * Profiling Error Boundary Component
 * 
 * React Error Boundary to catch and handle errors in profiling components.
 * Provides a user-friendly fallback UI when profiling features fail.
 */

import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Warning, ArrowCounterClockwise } from '@phosphor-icons/react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ProfilingErrorBoundary - Catches errors in profiling components
 */
export class ProfilingErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging
    console.error('Profiling Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <Warning size={20} />
              Profiling Error
            </CardTitle>
            <CardDescription>
              {this.props.fallbackMessage || 'An error occurred while rendering the profiling dashboard.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription className="text-sm">
                <strong>Error:</strong> {this.state.error?.message || 'Unknown error'}
              </AlertDescription>
            </Alert>

            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="text-xs text-muted-foreground bg-muted p-3 rounded-lg overflow-auto max-h-40">
                <summary className="cursor-pointer font-medium mb-2">Error Details (Development Only)</summary>
                <pre className="whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <Button onClick={this.handleReset} variant="outline" size="sm">
                <ArrowCounterClockwise size={16} className="mr-2" />
                Try Again
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="mb-2">Suggestions:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Try uploading a different ARM template</li>
                <li>Use the Quick Summary view instead</li>
                <li>Check the browser console for more details</li>
                <li>Contact support if the issue persists</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
