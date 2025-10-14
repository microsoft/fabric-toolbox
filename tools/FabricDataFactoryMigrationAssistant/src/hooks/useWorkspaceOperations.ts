import { useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { fabricService } from '@/services/fabricService';
import { WorkspaceInfo } from '@/types';
import { toast } from 'sonner';

export function useWorkspaceOperations() {
  const { state, dispatch } = useAppContext();

  const loadWorkspaces = useCallback(async (): Promise<void> => {
    if (!state.auth.accessToken) {
      dispatch({ type: 'SET_ERROR', payload: 'No access token available' });
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      const workspaces = await fabricService.getWorkspaces(state.auth.accessToken);
      
      if (workspaces.length === 0) {
        dispatch({ 
          type: 'SET_ERROR', 
          payload: 'No workspaces found. Please ensure you have access to at least one Fabric workspace.' 
        });
      } else {
        dispatch({ type: 'SET_AVAILABLE_WORKSPACES', payload: workspaces });
        
        // Auto-select if only one workspace with contributor access
        const contributorWorkspaces = workspaces.filter((w: WorkspaceInfo) => w.hasContributorAccess);
        if (contributorWorkspaces.length === 1) {
          dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: contributorWorkspaces[0] });
          toast.success(`Automatically selected "${contributorWorkspaces[0].name}"`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load workspaces';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      toast.error('Failed to load workspaces');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.auth.accessToken, dispatch]);

  const selectWorkspace = useCallback((workspaceId: string): void => {
    const selectedWorkspace = state.availableWorkspaces.find(
      (w: WorkspaceInfo) => w.id === workspaceId
    );
    
    if (selectedWorkspace) {
      dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: selectedWorkspace });
      
      if (!selectedWorkspace.hasContributorAccess) {
        toast.error('Selected workspace has insufficient permissions');
      } else {
        toast.success(`Selected workspace: ${selectedWorkspace.name}`);
      }
    }
  }, [state.availableWorkspaces, dispatch]);

  const validateWorkspacePermissions = useCallback(async (workspaceId: string): Promise<boolean> => {
    if (!state.auth.accessToken) {
      return false;
    }

    try {
      return await fabricService.validateWorkspacePermissions(workspaceId, state.auth.accessToken);
    } catch (error) {
      console.error('Failed to validate workspace permissions:', error);
      return false;
    }
  }, [state.auth.accessToken]);

  const clearWorkspaceSelection = useCallback((): void => {
    dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: null });
  }, [dispatch]);

  return {
    loadWorkspaces,
    selectWorkspace,
    validateWorkspacePermissions,
    clearWorkspaceSelection,
    workspaceState: state.workspace,
    isLoading: state.workspace.isLoadingWorkspaces,
    error: state.workspace.workspaceError,
    selectedWorkspace: state.workspace.selectedWorkspace,
    availableWorkspaces: state.workspace.availableWorkspaces
  };
}