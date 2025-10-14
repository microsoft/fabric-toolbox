import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Warning, User, Spinner, ArrowRight, ArrowLeft } from '@phosphor-icons/react';
import { workspaceIdentityService } from '../../services/workspaceIdentityService';
import { adfParserService } from '../../services/adfParserService';
import { toast } from 'sonner';
import { NavigationDebug } from '../NavigationDebug';

export function ManagedIdentityPage() {
  const { state, dispatch } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workspaceCredentials, setWorkspaceCredentials] = useState<any[]>([]);
  const [workspaceIdentity, setWorkspaceIdentity] = useState<any>(null);
  const [hasProcessedCredentials, setHasProcessedCredentials] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for managed identity credentials on component mount
  useEffect(() => {
    if (state.adfComponents && state.adfComponents.length > 0 && !hasProcessedCredentials) {
      checkForManagedIdentityCredentials();
    }
  }, [state.adfComponents, hasProcessedCredentials]);

  const checkForManagedIdentityCredentials = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Checking for managed identity credentials in ARM template...');
      
      // Process ARM template components to find managed identity credentials
      const credentials = workspaceIdentityService.processWorkspaceCredentials(state.adfComponents || []);
      
      setWorkspaceCredentials(credentials);
      setHasProcessedCredentials(true);

      if (credentials.length > 0) {
        console.log(`Found ${credentials.length} managed identity credential(s)`);
        toast.success(`Found ${credentials.length} managed identity credential(s) requiring workspace identity configuration`);
        
        // Check if workspace identity already exists
        if (state.selectedWorkspace?.id) {
          await checkExistingWorkspaceIdentity(state.selectedWorkspace.id);
        }
      } else {
        console.log('No managed identity credentials found - skipping workspace identity configuration');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process managed identity credentials';
      console.error('Error checking for managed identity credentials:', err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const checkExistingWorkspaceIdentity = async (workspaceId: string) => {
    try {
      console.log('Checking for existing workspace identity...');
      
      const workspaceDetails = await workspaceIdentityService.getWorkspaceDetails(workspaceId);
      
      if (workspaceDetails.workspaceIdentity) {
        console.log('Found existing workspace identity');
        setWorkspaceIdentity(workspaceDetails.workspaceIdentity);
        
        // Auto-map existing workspace identity to all credentials
        const updatedCredentials = workspaceIdentityService.updateCredentialMappings(
          workspaceCredentials,
          workspaceDetails.workspaceIdentity
        );
        setWorkspaceCredentials(updatedCredentials);
        
        toast.success('Automatically mapped existing workspace identity to managed identity credentials');
      } else {
        console.log('No existing workspace identity found');
      }
      
    } catch (err) {
      console.error('Error checking existing workspace identity:', err);
      // Don't show error toast here - user can still create new identity
    }
  };

  const createWorkspaceIdentity = async () => {
    if (!state.selectedWorkspace?.id) {
      toast.error('No workspace selected');
      return;
    }

    // Prevent duplicate calls if already processing
    if (isProcessing) {
      console.log('Identity creation already in progress, ignoring duplicate request');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      console.log('Creating new workspace identity...');
      
      const newIdentity = await workspaceIdentityService.ensureWorkspaceIdentity(state.selectedWorkspace.id);
      
      setWorkspaceIdentity(newIdentity);
      
      // Update credential mappings with new identity
      const updatedCredentials = workspaceIdentityService.updateCredentialMappings(
        workspaceCredentials,
        newIdentity
      );
      setWorkspaceCredentials(updatedCredentials);

      // Update app state with workspace identity
      dispatch({ type: 'SET_WORKSPACE_IDENTITY', payload: newIdentity });
      
      toast.success('Successfully created workspace identity');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create workspace identity';
      console.error('Error creating workspace identity:', err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNext = () => {
    // Update app state with workspace credentials
    dispatch({ 
      type: 'SET_WORKSPACE_CREDENTIALS', 
      payload: {
        credentials: workspaceCredentials,
        workspaceIdentity: workspaceIdentity,
        isLoading: false,
        error: null
      }
    });
    
    // Proceed to next step (LinkedServiceConnectionPage - now step 4)
    dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep + 1 });
  };

  const handleBack = () => {
    dispatch({ type: 'SET_CURRENT_STEP', payload: 2 }); // Go back to UploadPage (step 2)
  };

  const handleSkip = () => {
    console.log('Skipping managed identity configuration - no credentials found');
    dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep + 1 });
  };

  // Show loading state while checking for credentials
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Configure Workspace Identity</h1>
          <p className="text-muted-foreground">Analyzing ARM template for managed identity credentials...</p>
        </div>
        
        <Card>
          <CardContent className="py-8 text-center">
            <Spinner className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Processing ARM template components...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no managed identity credentials found, show skip option
  if (hasProcessedCredentials && workspaceCredentials.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Configure Workspace Identity</h1>
          <p className="text-muted-foreground">No managed identity credentials found in ARM template.</p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              No Configuration Required
            </CardTitle>
            <CardDescription>
              Your ARM template doesn't contain any managed identity credentials that require workspace identity configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleSkip}>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold mb-2">Configure Workspace Identity</h1>
        <p className="text-muted-foreground">
          Your ARM template contains managed identity credentials that require a Fabric workspace identity.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="mb-6" variant="destructive">
          <Warning className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Workspace Identity Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Workspace Identity Status
          </CardTitle>
          <CardDescription>
            {state.selectedWorkspace?.name} workspace identity configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspaceIdentity ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium text-green-700">Workspace Identity Configured</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Application ID</p>
                  <p className="font-mono text-sm">{workspaceIdentity.applicationId}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Service Principal ID</p>
                  <p className="font-mono text-sm">{workspaceIdentity.servicePrincipalId}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Warning className="h-5 w-5 text-orange-500" />
                <span className="font-medium text-orange-700">Workspace Identity Required</span>
              </div>
              <p className="text-muted-foreground mb-4">
                A workspace identity is required to support managed identity authentication in your migrated pipelines.
              </p>
              <Button 
                onClick={createWorkspaceIdentity} 
                disabled={isProcessing}
                className="w-full md:w-auto"
              >
                {isProcessing ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2 animate-spin" />
                    Creating Workspace Identity...
                  </>
                ) : (
                  'Create Workspace Identity'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Managed Identity Credentials */}
      {workspaceCredentials.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Managed Identity Credentials</CardTitle>
            <CardDescription>
              The following managed identity credentials will be mapped to the workspace identity:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {workspaceCredentials.map((credential, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{credential.sourceName}</p>
                    <p className="text-sm text-muted-foreground">
                      Type: {credential.sourceType}
                    </p>
                  </div>
                  <Badge variant={credential.status === 'configured' ? 'default' : 'secondary'}>
                    {credential.status === 'configured' ? 'Mapped' : 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Debug */}
      <NavigationDebug 
        customConditions={[
          {
            label: 'Not Processing Identity',
            condition: !isProcessing,
            description: 'Workspace identity creation must not be in progress'
          },
          {
            label: 'Credentials Processed',
            condition: hasProcessedCredentials,
            description: 'ARM template must be analyzed for managed identity credentials'
          }
        ]}
      />

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleNext} 
          disabled={workspaceCredentials.length > 0 && !workspaceIdentity}
        >
          Continue
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}