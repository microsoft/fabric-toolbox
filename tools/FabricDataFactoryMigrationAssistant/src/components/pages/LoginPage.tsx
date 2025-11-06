import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Key, Warning, CheckCircle, Buildings, FileArrowUp } from '@phosphor-icons/react';
import { WizardLayout } from '../WizardLayout';
import { useAppContext } from '../../contexts/AppContext';
import { authService } from '../../services/authService';
import { ServicePrincipalAuth, InteractiveLoginConfig } from '../../types';
import { validateCredentials, extractString } from '../../lib/validation';
import { validateTenantIdInput } from '../../lib/msalTenantUtils';

export function LoginPage() {
  const { state, dispatch } = useAppContext();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interactiveConfig, setInteractiveConfig] = useState<InteractiveLoginConfig>({
    tenantId: '',
    useTenantSpecific: true,
    applicationId: ''
  });
  const [spCredentials, setSpCredentials] = useState<ServicePrincipalAuth>({
    tenantId: '',
    clientId: '',
    clientSecret: ''
  });

  const handleMicrosoftLogin = async (): Promise<void> => {
    // Validate tenant ID first
    const tenantValidation = validateTenantIdInput(interactiveConfig.tenantId);
    if (!tenantValidation.isValid) {
      setError(tenantValidation.error || 'Invalid tenant ID');
      return;
    }

    // Validate application ID (should be a GUID)
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!interactiveConfig.applicationId.trim()) {
      setError('Application ID is required');
      return;
    }
    if (!guidRegex.test(interactiveConfig.applicationId.trim())) {
      setError('Application ID must be a valid GUID');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Show user that popup is launching
      setSuccess('Launching Microsoft login popup...');
      
      const authState = await authService.loginWithMicrosoft(interactiveConfig);
      
      if (!authState || !authState.isAuthenticated) {
        throw new Error('Authentication failed - invalid response');
      }

      authService.saveAuthState(authState);
      dispatch({ type: 'SET_AUTH', payload: authState });
      
      setSuccess('Successfully authenticated! Redirecting...');
      
      // Navigate to next step after brief delay to show success
      setTimeout(() => {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 2 });
      }, 1000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      setSuccess(null);
      console.error('Microsoft login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleServicePrincipalLogin = async (): Promise<void> => {
    const validation = validateCredentials(spCredentials);
    
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const authState = await authService.loginWithServicePrincipal(spCredentials);
      
      if (!authState || !authState.isAuthenticated) {
        throw new Error('Service principal authentication failed - invalid response');
      }

      authService.saveAuthState(authState);
      dispatch({ type: 'SET_AUTH', payload: authState });
      
      setSuccess('Service principal authenticated successfully! Redirecting...');
      
      // Navigate to next step after brief delay
      setTimeout(() => {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 2 });
      }, 1000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Service principal authentication failed';
      setError(errorMessage);
      setSuccess(null);
      console.error('Service principal login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateInteractiveConfig = (field: keyof InteractiveLoginConfig, value: string | boolean): void => {
    setInteractiveConfig(prev => ({ ...prev, [field]: value }));
    // Clear errors when user starts typing
    if (error) {
      setError(null);
    }
  };

  const updateSpCredentials = (field: keyof ServicePrincipalAuth, value: string): void => {
    setSpCredentials(prev => ({ ...prev, [field]: extractString(value) }));
    // Clear errors when user starts typing
    if (error) {
      setError(null);
    }
  };

  return (
    <WizardLayout
      title="Authentication Required"
      description="Sign in to access Microsoft Fabric APIs and begin your migration"
      showNavigation={false}
    >
      <div className="max-w-xl mx-auto space-y-4">
        {/* Uploaded File Summary Banner */}
        {state.uploadedFile && state.adfComponents.length > 0 && (
          <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700">
            <FileArrowUp size={16} className="text-blue-600 dark:text-blue-400" />
            <AlertDescription>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    📄 Uploaded: {state.uploadedFile.name}
                  </div>
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    {state.adfComponents.filter(c => c.type === 'pipeline').length} pipelines • {' '}
                    {state.adfComponents.filter(c => c.type === 'dataset').length} datasets • {' '}
                    {state.adfComponents.filter(c => c.type === 'linkedService').length} linked services • {' '}
                    {state.adfComponents.filter(c => c.type === 'trigger').length} triggers
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="interactive" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="interactive" className="text-sm">Interactive Login</TabsTrigger>
            <TabsTrigger value="service-principal" className="text-sm">Service Principal</TabsTrigger>
          </TabsList>
          
          <TabsContent value="interactive">
            <Card>
              <CardHeader className="text-center pb-4">
                <CardTitle className="flex items-center justify-center gap-2 text-base">
                  <User size={20} weight="fill" />
                  Sign in with Microsoft
                </CardTitle>
                <CardDescription className="text-sm">
                  Use your Microsoft account to authenticate with Azure AD and access Fabric resources
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                  <h4 className="font-medium mb-1 text-gray-900 flex items-center gap-2 text-sm">
                    <Buildings size={14} className="text-blue-600" />
                    Tenant-Specific Authentication
                  </h4>
                  <p className="text-xs text-gray-800">
                    This app uses tenant-specific authentication. You must specify your Azure AD tenant before signing in.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tenant-id-interactive" className="text-xs">Azure AD Tenant ID *</Label>
                  <Input
                    id="tenant-id-interactive"
                    placeholder="Enter your tenant ID (GUID or domain.onmicrosoft.com)"
                    value={interactiveConfig.tenantId}
                    onChange={(e) => updateInteractiveConfig('tenantId', e.target.value)}
                    required
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-gray-600">
                    Examples: 12345678-1234-1234-1234-123456789012 or contoso.onmicrosoft.com
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="application-id-interactive" className="text-xs">Azure AD Application ID *</Label>
                  <Input
                    id="application-id-interactive"
                    placeholder="Enter your Azure AD application ID (GUID)"
                    value={interactiveConfig.applicationId}
                    onChange={(e) => updateInteractiveConfig('applicationId', e.target.value)}
                    required
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-gray-600">
                    Example: 12345678-1234-1234-1234-123456789012
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                  <h4 className="font-medium mb-2 text-gray-900 text-sm">Required Azure AD Application Configuration</h4>
                  <div className="space-y-2 text-xs text-gray-800">
                    <div>
                      <p className="font-medium">Redirect URI (Callback URL):</p>
                      <div className="bg-card p-2 rounded border mt-1">
                        <code className="text-xs font-mono break-all">
                          {typeof window !== 'undefined' ? window.location.origin : 'https://your-app-domain.com'}
                        </code>
                      </div>
                      <p className="mt-1 text-xs text-gray-700">
                        Add this URL to your Azure AD application's "Redirect URIs" under Authentication settings.
                        Select "Single-page application (SPA)" as the platform type.
                      </p>
                    </div>
                    
                    <div>
                      <p className="font-medium">Required API Permissions:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs mt-1">
                        <li>Power BI Service: Connection.ReadWrite.All (Delegated)</li>
                        <li>Power BI Service: DataPipeline.ReadWrite.All (Delegated)</li>
                        <li>Power BI Service: Gateway.ReadWrite.All (Delegated)</li>
                        <li>Power BI Service: Item.ReadWrite.All (Delegated)</li>
                        <li>Power BI Service: Workspace.ReadWrite.All (Delegated)</li>
                      </ul>
                      <p className="mt-1 text-xs text-gray-700">
                        Grant admin consent for your organization after adding these permissions.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <h4 className="font-medium mb-1 text-gray-900 text-sm">Configuration Required</h4>
                  <p className="text-xs text-gray-800">
                    You must provide both your Azure AD tenant ID and application ID. The application will use these to authenticate with Microsoft Fabric APIs. Ensure your Azure AD application has the required API permissions for Fabric access.
                  </p>
                </div>
                
                {success && (
                  <Alert className="border-accent bg-accent/10">
                    <CheckCircle size={16} className="text-accent" />
                    <AlertDescription className="text-accent-foreground">{success}</AlertDescription>
                  </Alert>
                )}
                
                {error && (
                  <Alert variant="destructive">
                    <Warning size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <Button 
                  onClick={handleMicrosoftLogin}
                  disabled={isLoading || !!success || !interactiveConfig.tenantId.trim() || !interactiveConfig.applicationId.trim()}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? 'Signing in...' : success ? 'Success!' : 'Sign in with Microsoft'}
                </Button>
                
                <div className="text-xs text-gray-600 space-y-1">
                  <p>• Ensure popups are enabled for this site</p>
                  <p>• Click once and wait for the popup to appear</p>
                  <p>• Sign in with your Microsoft account from the specified tenant</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="service-principal">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key size={20} />
                  Service Principal Authentication
                </CardTitle>
                <CardDescription>
                  Use service principal credentials for headless authentication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-id">Tenant ID</Label>
                  <Input
                    id="tenant-id"
                    placeholder="Enter your Azure AD tenant ID"
                    value={spCredentials.tenantId}
                    onChange={(e) => updateSpCredentials('tenantId', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="client-id">Client ID</Label>
                  <Input
                    id="client-id"
                    placeholder="Enter your application client ID"
                    value={spCredentials.clientId}
                    onChange={(e) => updateSpCredentials('clientId', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="client-secret">Client Secret</Label>
                  <Input
                    id="client-secret"
                    type="password"
                    placeholder="Enter your client secret"
                    value={spCredentials.clientSecret}
                    onChange={(e) => updateSpCredentials('clientSecret', e.target.value)}
                  />
                </div>
                
                {success && (
                  <Alert className="border-accent bg-accent/10">
                    <CheckCircle size={16} className="text-accent" />
                    <AlertDescription className="text-accent-foreground">{success}</AlertDescription>
                  </Alert>
                )}
                
                {error && (
                  <Alert variant="destructive">
                    <Warning size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <Button 
                  onClick={handleServicePrincipalLogin}
                  disabled={isLoading || !!success}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? 'Authenticating...' : success ? 'Success!' : 'Authenticate'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </WizardLayout>
  );
}