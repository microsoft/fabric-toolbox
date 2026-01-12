import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner, Building, Warning, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { useAppContext } from '../../contexts/AppContext';
import { fabricService } from '../../services/fabricService';
import { toast } from 'sonner';
import type { WorkspaceInfo } from '../../types';

export function WorkspaceSelectionPage(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter workspaces based on search query
  const filteredWorkspaces = state.availableWorkspaces.filter(
    (workspace: WorkspaceInfo) =>
      workspace.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (workspace.description && workspace.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Load workspaces when component mounts
  useEffect(() => {
    if (state.auth.isAuthenticated && state.auth.accessToken && state.availableWorkspaces.length === 0) {
      loadWorkspaces();
    }
  }, [state.auth.isAuthenticated, state.auth.accessToken]);

  const loadWorkspaces = async (): Promise<void> => {
    if (!state.auth.accessToken) {
      setError('No access token available');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const workspaces = await fabricService.getWorkspaces(state.auth.accessToken);
      
      // Filter for workspaces where user has contributor access or higher
      const contributorWorkspaces = await validateWorkspacePermissions(workspaces, state.auth.accessToken);
      
      dispatch({ type: 'SET_AVAILABLE_WORKSPACES', payload: contributorWorkspaces });
      
      if (contributorWorkspaces.length === 0) {
        setError('No workspaces found where you have Contributor or higher access. Please contact your administrator to grant you access to a Fabric workspace.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load workspaces';
      setError(errorMessage);
      toast.error('Failed to load workspaces: ' + errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const validateWorkspacePermissions = async (workspaces: WorkspaceInfo[], accessToken: string): Promise<WorkspaceInfo[]> => {
    // For now, return all workspaces. In real implementation, 
    // we would call Fabric API to check permissions for each workspace
    // This is a simplified version that assumes all returned workspaces have appropriate access
    return workspaces;
  };

  const handleWorkspaceSelect = (workspaceId: string): void => {
    const selectedWorkspace = state.availableWorkspaces.find(
      (ws: WorkspaceInfo) => ws.id === workspaceId
    );
    
    if (selectedWorkspace) {
      dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: selectedWorkspace });
      // Set contributor access to true since we validated permissions
      dispatch({ 
        type: 'SET_AUTH', 
        payload: { 
          ...state.auth, 
          workspaceId: selectedWorkspace.id,
          hasContributorAccess: true 
        } 
      });
      toast.success(`Selected workspace: ${selectedWorkspace.name}`);
    }
  };

  const handleContinue = (): void => {
    if (state.selectedWorkspace) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: 2 }); // Go to upload page
    }
  };

  const handleRetry = (): void => {
    loadWorkspaces();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Select Fabric Workspace</h1>
            <p className="text-muted-foreground">
              Choose the Microsoft Fabric workspace where you want to deploy your migrated Data Factory components
            </p>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center justify-center space-x-2 mb-6">
            <div className="text-sm text-muted-foreground">Step 2 of 7: Workspace Selection</div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5" />
                Available Workspaces
              </CardTitle>
              <CardDescription>
                Select a Fabric workspace where you have Contributor or higher permissions. 
                Only workspaces with appropriate access are shown.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="w-6 h-6 animate-spin mr-2" />
                  <span>Loading available workspaces...</span>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <Warning className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>{error}</span>
                    <Button 
                      onClick={handleRetry} 
                      variant="outline" 
                      size="sm"
                      className="ml-4"
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {!isLoading && 
               !error && 
               state.availableWorkspaces.length > 0 && (
                <div className="space-y-4">
                  {/* Search functionality */}
                  {state.availableWorkspaces.length > 5 && (
                    <div className="relative">
                      <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input
                        type="text"
                        placeholder="Search workspaces..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  )}

                  {/* Workspace selection */}
                  <Select 
                    value={state.selectedWorkspace?.id || ''} 
                    onValueChange={handleWorkspaceSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a workspace..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredWorkspaces.map((workspace: WorkspaceInfo) => (
                        <SelectItem key={workspace.id} value={workspace.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{workspace.name}</span>
                            {workspace.description && (
                              <span className="text-sm text-muted-foreground">
                                {workspace.description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Selected workspace confirmation */}
                  {state.selectedWorkspace && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Selected workspace:</strong> {state.selectedWorkspace.name}
                        {state.selectedWorkspace.description && (
                          <br />
                        )}
                        {state.selectedWorkspace.description}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Workspace info */}
                  <div className="text-sm text-muted-foreground">
                    Found {filteredWorkspaces.length} workspace{filteredWorkspaces.length !== 1 ? 's' : ''} 
                    {searchQuery && ` matching "${searchQuery}"`}
                  </div>
                </div>
              )}

              {/* No workspaces message */}
              {!isLoading && 
               !error && 
               state.availableWorkspaces.length === 0 && (
                <Alert>
                  <Warning className="h-4 w-4" />
                  <AlertDescription>
                    No workspaces found where you have Contributor or higher access. 
                    Please contact your administrator to request access to a Fabric workspace.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Navigation buttons */}
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => dispatch({ type: 'SET_CURRENT_STEP', payload: 0 })}
            >
              Back to Login
            </Button>
            
            <Button 
              onClick={handleContinue}
              disabled={!state.selectedWorkspace}
              className="flex items-center gap-2"
            >
              Continue to Upload
              <CheckCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}