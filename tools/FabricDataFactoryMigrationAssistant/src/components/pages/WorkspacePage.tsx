import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { fabricService } from '../../services/fabricService';
import { fabricWorkspaceService } from '../../services/fabricWorkspaceService';
import { WorkspaceInfo } from '../../types';
import { formatScopesForDisplay, getMissingScopesDescription } from '../../lib/tokenUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner, Building, CheckCircle, XCircle, Warning, Info, Shield, Plus, FileArrowUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { NavigationDebug } from '../NavigationDebug';

export function WorkspacePage() {
  const { state, dispatch } = useAppContext();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [validatingPermissions, setValidatingPermissions] = useState<boolean>(false);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState<string>('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState<boolean>(false);

  // Load available workspaces when component mounts
  useEffect(() => {
    if (state.auth.isAuthenticated && state.auth.accessToken) {
      loadWorkspaces();
    }
  }, [state.auth.isAuthenticated, state.auth.accessToken]);

  const loadWorkspaces = async (): Promise<void> => {
    if (!state.auth.accessToken) {
      toast.error('Authentication required. Please sign in again.');
      return;
    }

    setIsLoading(true);
    try {
      const workspaces = await fabricService.getWorkspaces(state.auth.accessToken);
      dispatch({ type: 'SET_AVAILABLE_WORKSPACES', payload: workspaces });
      
      // Auto-select if there's only one workspace with contributor access
      const contributorWorkspaces = (workspaces || []).filter(w => w && w.hasContributorAccess);
      if (contributorWorkspaces.length === 1) {
        const firstWorkspace = contributorWorkspaces[0];
        if (firstWorkspace) {
          setSelectedWorkspaceId(firstWorkspace.id);
          dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: firstWorkspace });
        }
      }
      
      if ((workspaces || []).length === 0) {
        toast.error('No workspaces found. Please ensure you have access to at least one Fabric workspace.');
      } else if (contributorWorkspaces.length === 0) {
        toast.warning('No workspaces with Contributor access found. You need Contributor or higher permissions to perform migrations.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load workspaces';
      toast.error(errorMessage);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWorkspaceSelection = async (workspaceId: string): Promise<void> => {
    const workspace = (state.availableWorkspaces || []).find(w => w && w.id === workspaceId);
    if (!workspace) {
      toast.error('Selected workspace not found.');
      return;
    }

    setSelectedWorkspaceId(workspaceId);

    // Validate permissions for the selected workspace
    if (!workspace.hasContributorAccess) {
      toast.error('You do not have Contributor access to this workspace. Please select a different workspace.');
      dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: null });
      return;
    }

    setValidatingPermissions(true);
    try {
      const hasPermissions = await fabricService.validateWorkspacePermissions(
        workspaceId,
        state.auth.accessToken!
      );

      if (hasPermissions) {
        const updatedWorkspace: WorkspaceInfo = {
          ...workspace,
          hasContributorAccess: hasPermissions
        };
        
        dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: updatedWorkspace });
        toast.success(`Workspace "${workspace.name}" selected successfully.`);
      } else {
        toast.error(`Insufficient permissions for workspace "${workspace.name}". You need Contributor or higher access.`);
        dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: null });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to validate workspace permissions';
      toast.error(errorMessage);
      dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: null });
    } finally {
      setValidatingPermissions(false);
    }
  };

  const handleContinue = (): void => {
    if (state.selectedWorkspace && state.selectedWorkspace.hasContributorAccess) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: 3 }); // Move to managed identity step
    } else {
      toast.error('Please select a workspace with Contributor access to continue.');
    }
  };

  const handleCreateWorkspace = async (): Promise<void> => {
    if (!newWorkspaceName.trim()) {
      toast.error('Please enter a workspace name.');
      return;
    }

    if (!state.auth.accessToken) {
      toast.error('Authentication required. Please sign in again.');
      return;
    }

    // Validate workspace name
    const validation = fabricWorkspaceService.validateWorkspaceName(newWorkspaceName);
    if (!validation.isValid) {
      toast.error(`Invalid workspace name: ${validation.errors.join(', ')}`);
      return;
    }

    setIsCreatingWorkspace(true);
    try {
      const newWorkspace = await fabricWorkspaceService.createWorkspace(
        newWorkspaceName.trim(),
        state.auth.accessToken
      );

      console.log('Successfully created workspace:', newWorkspace);

      // Convert the created workspace to WorkspaceInfo format
      const workspaceInfo: WorkspaceInfo = {
        id: newWorkspace.id,
        name: newWorkspace.displayName,
        description: newWorkspace.description,
        type: newWorkspace.type,
        hasContributorAccess: true // User who creates workspace has contributor access
      };

      // Add the new workspace to available workspaces
      const updatedWorkspaces = [...(state.availableWorkspaces || []), workspaceInfo];
      dispatch({ type: 'SET_AVAILABLE_WORKSPACES', payload: updatedWorkspaces });

      // Select the new workspace automatically
      setSelectedWorkspaceId(newWorkspace.id);
      dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: workspaceInfo });

      // Clear form and hide create form
      setNewWorkspaceName('');
      setShowCreateForm(false);

      toast.success(`Workspace "${newWorkspace.displayName}" created successfully!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create workspace';
      console.error('Error creating workspace:', error);
      toast.error(errorMessage);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleCancelCreate = (): void => {
    setNewWorkspaceName('');
    setShowCreateForm(false);
  };

  const getPermissionIcon = (workspace: WorkspaceInfo) => {
    if (workspace.hasContributorAccess) {
      return <CheckCircle size={20} className="text-accent" />;
    } else {
      return <XCircle size={20} className="text-destructive" />;
    }
  };

  const getPermissionText = (workspace: WorkspaceInfo): string => {
    if (workspace.hasContributorAccess) {
      return 'Contributor Access';
    } else {
      return 'Insufficient Access';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">
            Select Fabric Workspace
          </h1>
          <p className="text-muted-foreground">
            Choose the Microsoft Fabric workspace where you want to deploy your migrated Data Factory pipelines.
            You need Contributor or higher permissions to perform migrations.
          </p>
        </div>

        {/* Uploaded File Summary Banner */}
        {state.uploadedFile && state.adfComponents.length > 0 && (
          <div className="mb-6">
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
          </div>
        )}

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span>Step 2 of 7:</span>
            <span className="font-medium text-foreground">Workspace Selection</span>
          </div>
          <div className="mt-2 h-2 bg-secondary rounded-full">
            <div className="h-2 bg-primary rounded-full" style={{ width: '28.5%' }}></div>
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building size={24} />
              Available Workspaces
            </CardTitle>
            <CardDescription>
              Select a workspace where you have Contributor or higher permissions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Token Scopes Information */}
            {state.auth.tokenScopes && (
              <Card className="bg-muted/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield size={20} />
                    OAuth Token Permissions
                  </CardTitle>
                  <CardDescription>
                    Current access token scopes for Fabric API operations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      {state.auth.tokenScopes.connectionReadWrite ? (
                        <CheckCircle size={16} className="text-accent" />
                      ) : (
                        <XCircle size={16} className="text-destructive" />
                      )}
                      <span className="text-sm font-medium">Connection.ReadWrite.All</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {state.auth.tokenScopes.gatewayReadWrite ? (
                        <CheckCircle size={16} className="text-accent" />
                      ) : (
                        <XCircle size={16} className="text-destructive" />
                      )}
                      <span className="text-sm font-medium">Gateway.ReadWrite.All</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {state.auth.tokenScopes.itemReadWrite ? (
                        <CheckCircle size={16} className="text-accent" />
                      ) : (
                        <XCircle size={16} className="text-destructive" />
                      )}
                      <span className="text-sm font-medium">Item.ReadWrite.All</span>
                    </div>
                  </div>
                  
                  {!state.auth.tokenScopes.hasAllRequiredScopes && (
                    <Card className="border-warning bg-warning/5">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Warning size={20} className="text-warning mt-0.5" />
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-foreground">
                              Missing Required Permissions
                            </h4>
                            <div className="text-sm text-muted-foreground">
                              <p className="mb-2">Missing permissions:</p>
                              <p className="text-xs text-warning">
                                {getMissingScopesDescription(state.auth.tokenScopes?.scopes || [])}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {state.auth.tokenScopes?.hasAllRequiredScopes && (
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-accent" />
                      <span className="text-sm text-accent font-medium">All required scopes are present</span>
                    </div>
                  )}
                  
                  <details className="group">
                    <summary className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                      <Info size={16} />
                      View all token scopes ({state.auth.tokenScopes?.scopes?.length || 0} total)
                    </summary>
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {(state.auth.tokenScopes?.scopes || []).map((scope, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size={32} className="animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading workspaces...</span>
              </div>
            ) : state.availableWorkspaces.length === 0 ? (
              <div className="text-center py-8">
                <Warning size={48} className="mx-auto text-warning mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Workspaces Found</h3>
                <p className="text-muted-foreground mb-4">
                  You don't have access to any Fabric workspaces, or there was an error loading them.
                </p>
                <Button onClick={loadWorkspaces} variant="outline">
                  Retry Loading Workspaces
                </Button>
              </div>
            ) : (
              <>
                {/* Workspace Selection Options */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                      Workspace Selection
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateForm(!showCreateForm)}
                      disabled={isCreatingWorkspace}
                      className="flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Create New Workspace
                    </Button>
                  </div>

                  {/* Create New Workspace Form */}
                  {showCreateForm && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Plus size={20} />
                          Create New Workspace
                        </CardTitle>
                        <CardDescription>
                          Create a new Microsoft Fabric workspace for your Data Factory migration
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="new-workspace-name">Workspace Name</Label>
                          <Input
                            id="new-workspace-name"
                            type="text"
                            placeholder="Enter workspace name..."
                            value={newWorkspaceName}
                            onChange={(e) => setNewWorkspaceName(e.target.value)}
                            disabled={isCreatingWorkspace}
                            maxLength={256}
                          />
                          <p className="text-xs text-muted-foreground">
                            Choose a descriptive name for your new workspace (1-256 characters)
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={handleCreateWorkspace}
                            disabled={isCreatingWorkspace || !newWorkspaceName.trim()}
                            className="flex items-center gap-2"
                          >
                            {isCreatingWorkspace ? (
                              <>
                                <Spinner size={16} className="animate-spin" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <Plus size={16} />
                                Create Workspace
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleCancelCreate}
                            disabled={isCreatingWorkspace}
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Choose Existing Workspace */}
                  <div className="space-y-4">
                    <label htmlFor="workspace-select" className="text-sm font-medium text-foreground">
                      Choose Existing Workspace
                    </label>
                    <Select 
                      value={selectedWorkspaceId} 
                      onValueChange={handleWorkspaceSelection}
                      disabled={validatingPermissions || isCreatingWorkspace}
                    >
                      <SelectTrigger id="workspace-select" className="w-full">
                        <SelectValue placeholder="Select a workspace..." />
                      </SelectTrigger>
                      <SelectContent>
                        {state.availableWorkspaces.map((workspace) => (
                          <SelectItem 
                            key={workspace.id} 
                            value={workspace.id}
                            disabled={!workspace.hasContributorAccess}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col">
                                <span className="font-medium">{workspace.name}</span>
                                {workspace.description && (
                                  <span className="text-xs text-muted-foreground">
                                    {workspace.description}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {getPermissionIcon(workspace)}
                                <span className="text-xs text-muted-foreground">
                                  {getPermissionText(workspace)}
                                </span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Validation Status */}
                {validatingPermissions && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size={16} className="animate-spin" />
                    Validating workspace permissions...
                  </div>
                )}

                {/* Selected Workspace Info */}
                {state.selectedWorkspace && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <h4 className="font-medium text-foreground">Selected Workspace</h4>
                          <p className="text-sm text-foreground font-medium">
                            {state.selectedWorkspace.name}
                          </p>
                          {state.selectedWorkspace.description && (
                            <p className="text-sm text-muted-foreground">
                              {state.selectedWorkspace.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            {getPermissionIcon(state.selectedWorkspace)}
                            <span className="text-sm text-muted-foreground">
                              {getPermissionText(state.selectedWorkspace)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Warning for workspaces without access */}
                {state.availableWorkspaces.some(w => !w.hasContributorAccess) && (
                  <Card className="border-warning bg-warning/5">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Warning size={20} className="text-warning mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-foreground">
                            Limited Access Warning
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Some workspaces are disabled because you don't have Contributor or higher permissions. 
                            Contact your Fabric administrator to request access if needed.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Navigation Debug */}
        <NavigationDebug 
          customConditions={[
            {
              label: 'Currently Validating Permissions',
              condition: !validatingPermissions,
              description: 'Permission validation must not be in progress'
            }
          ]}
        />

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <Button 
            variant="outline" 
            onClick={() => dispatch({ type: 'SET_CURRENT_STEP', payload: 0 })}
          >
            Back to Login
          </Button>
          
          <Button 
            onClick={handleContinue}
            disabled={!state.selectedWorkspace || !state.selectedWorkspace.hasContributorAccess || validatingPermissions || isCreatingWorkspace}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}