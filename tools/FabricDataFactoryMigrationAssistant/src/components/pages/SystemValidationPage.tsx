import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Info } from '@phosphor-icons/react';
import { validateRefactoredSystem, runSmokeTest } from '../../lib/systemValidator';

/**
 * Testing page to validate the refactored supported connection types system
 * This page is used to ensure all the refactoring is working correctly
 */
export function SystemValidationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<{
    fullValidation?: boolean;
    smokeTest?: boolean;
    error?: string;
  }>({});

  const runFullValidation = async () => {
    setIsRunning(true);
    setResults({});
    
    try {
      const fullResult = await validateRefactoredSystem();
      const smokeResult = await runSmokeTest();
      
      setResults({
        fullValidation: fullResult,
        smokeTest: smokeResult
      });
    } catch (error) {
      setResults({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Auto-run smoke test on component mount
  useEffect(() => {
    runSmokeTest()
      .then(result => setResults(prev => ({ ...prev, smokeTest: result })))
      .catch(error => setResults(prev => ({ ...prev, error: error.message })));
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">System Validation</h1>
          <p className="text-muted-foreground mt-2">
            Validation of the refactored Supported Connection Types system
          </p>
        </div>

        {/* Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info size={20} />
              Refactoring Status
            </CardTitle>
            <CardDescription>
              Overview of the implemented changes to the supported connection types system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium">✅ Implemented Changes</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Created SupportedConnectionTypesService</li>
                  <li>• Fixed localeCompare safety issues</li>
                  <li>• Custom activity LinkedService tracking with 3-tier reference detection</li>
                  <li>• Enhanced dependency graphs with all resource-level relationships</li>
                  <li>• Added centralized Data Factory→Fabric type mapping</li>
                  <li>• Comprehensive profiling metrics and warning system</li>
                  <li>• Integrated dynamic API-based validation</li>
                  <li>• Updated FabricService to use new service</li>
                  <li>• Enhanced error messages with real API data</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">🔧 Key Features</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Caching with TTL and safe fallbacks</li>
                  <li>• Reuses existing authentication</li>
                  <li>• Graceful offline handling</li>
                  <li>• Case-insensitive type matching</li>
                  <li>• Similar type suggestions</li>
                  <li>• Safe sorting without runtime crashes</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              Validation of the refactored system functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button 
                onClick={runFullValidation} 
                disabled={isRunning}
                className="flex items-center gap-2"
              >
                {isRunning ? 'Running...' : 'Run Full Validation'}
              </Button>
              
              {results.smokeTest !== undefined && (
                <Badge variant={results.smokeTest ? 'default' : 'destructive'} className="flex items-center gap-1">
                  {results.smokeTest ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  Smoke Test: {results.smokeTest ? 'PASSED' : 'FAILED'}
                </Badge>
              )}
            </div>

            {results.fullValidation !== undefined && (
              <Alert className={results.fullValidation ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                <div className="flex items-center gap-2">
                  {results.fullValidation ? 
                    <CheckCircle size={16} className="text-green-600" /> : 
                    <XCircle size={16} className="text-red-600" />
                  }
                  <AlertDescription>
                    Full validation: {results.fullValidation ? 'PASSED' : 'FAILED'}
                    {results.fullValidation && ' - All systems are working correctly'}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {results.error && (
              <Alert className="border-red-200 bg-red-50">
                <XCircle size={16} className="text-red-600" />
                <AlertDescription>
                  Error during validation: {results.error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Implementation</CardTitle>
            <CardDescription>
              Details about the refactored architecture
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Central Service Architecture</h4>
                <p className="text-sm text-muted-foreground">
                  The new <code>SupportedConnectionTypesService</code> provides a single source of truth for 
                  connector support validation, replacing hardcoded lists throughout the application.
                </p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Runtime Safety</h4>
                <p className="text-sm text-muted-foreground">
                  All <code>localeCompare</code> calls now use the <code>safeSorted</code> function which 
                  handles undefined values gracefully, preventing the "Cannot read properties of undefined" errors.
                </p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Dynamic API Integration</h4>
                <p className="text-sm text-muted-foreground">
                  The service fetches real-time supported types from the Fabric API using existing authentication, 
                  with intelligent caching and offline fallbacks.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}