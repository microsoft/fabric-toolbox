import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { 
  AppState, 
  AuthState, 
  ADFComponent, 
  DeploymentResult, 
  WizardStep, 
  FabricTarget, 
  WorkspaceInfo, 
  ConnectionMappingState, 
  LinkedServiceConnection, 
  FabricGateway, 
  SupportedConnectionType, 
  ConnectionDeploymentResult, 
  PipelineConnectionMappings, 
  WorkspaceCredentialState, 
  WorkspaceCredentialMapping, 
  WorkspaceIdentityInfo,
  FolderTreeNode,
  FolderDeploymentResult,
  GlobalParameterReference,
  VariableLibraryConfig
} from '../types';
import { initializeScheduleTarget } from '../services/componentMappingService';
import { ADFProfile } from '../types/profiling';
import { createDefaultAppState } from '../lib/stateValidation';

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

type AppAction =
  | { type: 'SET_CURRENT_STEP'; payload: number }
  | { type: 'SET_AUTH'; payload: AuthState }
  | { type: 'SET_AVAILABLE_WORKSPACES'; payload: WorkspaceInfo[] }
  | { type: 'SET_SELECTED_WORKSPACE'; payload: WorkspaceInfo | null }
  | { type: 'SET_UPLOADED_FILE'; payload: File | null }
  | { type: 'SET_ADF_COMPONENTS'; payload: ADFComponent[] }
  | { type: 'SET_ADF_PROFILE'; payload: ADFProfile | null }
  | { type: 'UPDATE_COMPONENT_SELECTION'; payload: { index: number; isSelected: boolean } }
  | { type: 'BULK_UPDATE_COMPONENT_SELECTION'; payload: { indices: number[]; isSelected: boolean } }
  | { type: 'TOGGLE_ALL_COMPONENTS'; payload: { type: string; isSelected: boolean } }
  | { type: 'UPDATE_COMPONENT_TARGET'; payload: { index: number; fabricTarget: FabricTarget } }
  | { type: 'BULK_UPDATE_FABRIC_TARGETS'; payload: Array<{ mappingIndex: number; fabricTarget: FabricTarget }> }
  | { type: 'SET_DEPLOYMENT_RESULTS'; payload: DeploymentResult[] }
  | { type: 'ADD_DEPLOYMENT_RESULT'; payload: DeploymentResult }
  | { type: 'SET_CONNECTION_MAPPINGS'; payload: ConnectionMappingState }
  | { type: 'SET_LINKED_SERVICES'; payload: LinkedServiceConnection[] }
  | { type: 'UPDATE_LINKED_SERVICE'; payload: { index: number; update: Partial<LinkedServiceConnection> } }
  | { type: 'SET_AVAILABLE_GATEWAYS'; payload: FabricGateway[] }
  | { type: 'SET_SUPPORTED_CONNECTION_TYPES'; payload: SupportedConnectionType[] }
  | { type: 'SET_CONNECTION_DEPLOYMENT_RESULTS'; payload: ConnectionDeploymentResult[] }
  | { type: 'ADD_CONNECTION_DEPLOYMENT_RESULT'; payload: ConnectionDeploymentResult }
  | { type: 'SET_PIPELINE_CONNECTION_MAPPINGS'; payload: PipelineConnectionMappings }
  | { type: 'UPDATE_PIPELINE_CONNECTION_MAPPING'; payload: { pipelineName: string; activityName: string; mapping: any } }
  | { type: 'UPDATE_CUSTOM_ACTIVITY_MAPPING'; payload: { pipelineName: string; activityName: string; reference: any } }
  | { type: 'BUILD_LINKEDSERVICE_CONNECTION_BRIDGE'; payload: any }
  | { type: 'UPDATE_BRIDGE_MAPPING'; payload: { linkedServiceName: string; mapping: any } }
  | { type: 'SET_WORKSPACE_CREDENTIALS'; payload: WorkspaceCredentialState }
  | { type: 'UPDATE_WORKSPACE_CREDENTIAL'; payload: { index: number; update: Partial<WorkspaceCredentialMapping> } }
  | { type: 'SET_WORKSPACE_IDENTITY'; payload: WorkspaceIdentityInfo }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' }
  /** NEW: Folder-related actions */
  | { type: 'SET_FOLDER_HIERARCHY'; payload: FolderTreeNode[] }
  | { type: 'SET_FOLDER_MAPPINGS'; payload: Record<string, string> }
  | { type: 'ADD_FOLDER_DEPLOYMENT_RESULT'; payload: FolderDeploymentResult }
  | { type: 'SET_FOLDER_DEPLOYMENT_RESULTS'; payload: FolderDeploymentResult[] }
  /** NEW: Global parameter actions */
  | { type: 'SET_GLOBAL_PARAMETER_REFERENCES'; payload: GlobalParameterReference[] }
  | { type: 'SET_VARIABLE_LIBRARY_CONFIG'; payload: VariableLibraryConfig }
  | { type: 'SET_GLOBAL_PARAMETER_CONFIG_COMPLETED'; payload: boolean };

const initialState: AppState = createDefaultAppState();

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: Math.max(0, Math.min(10, action.payload)) };
    
    case 'SET_AUTH':
      return { ...state, auth: action.payload };
    
    case 'SET_AVAILABLE_WORKSPACES':
      return { ...state, availableWorkspaces: action.payload || [] };
    
    case 'SET_SELECTED_WORKSPACE':
      return { ...state, selectedWorkspace: action.payload };
    
    case 'SET_UPLOADED_FILE':
      return { ...state, uploadedFile: action.payload };
    
    case 'SET_ADF_COMPONENTS':
      const components = action.payload || [];
      // Auto-initialize schedule configs for triggers
      const componentsWithScheduleConfigs = components.map(component => {
        if (component.type === 'trigger' && component.triggerMetadata && !component.fabricTarget?.scheduleConfig) {
          try {
            const scheduleTarget = initializeScheduleTarget(component);
            console.log(`Initialized schedule config for trigger ${component.name}:`, {
              enabled: scheduleTarget.scheduleConfig?.enabled,
              targetPipelines: scheduleTarget.scheduleConfig?.targetPipelines.length
            });
            return {
              ...component,
              fabricTarget: scheduleTarget
            };
          } catch (error) {
            console.error(`Failed to initialize schedule config for trigger ${component.name}:`, error);
            return component;
          }
        }
        return component;
      });
      
      return { 
        ...state, 
        adfComponents: componentsWithScheduleConfigs,
        selectedComponents: componentsWithScheduleConfigs.filter(c => c && c.isSelected)
      };
    
    case 'SET_ADF_PROFILE':
      return { ...state, adfProfile: action.payload };
    
    case 'UPDATE_COMPONENT_SELECTION':
      const updatedComponents = [...(state.adfComponents || [])];
      const targetIndex = action.payload.index;
      
      if (targetIndex >= 0 && targetIndex < updatedComponents.length && updatedComponents[targetIndex]) {
        updatedComponents[targetIndex] = {
          ...updatedComponents[targetIndex],
          isSelected: action.payload.isSelected
        };
      }
      
      return {
        ...state,
        adfComponents: updatedComponents,
        selectedComponents: updatedComponents.filter(c => c && c.isSelected)
      };
    
    case 'BULK_UPDATE_COMPONENT_SELECTION':
      const bulkUpdated = [...(state.adfComponents || [])];
      action.payload.indices.forEach(index => {
        if (index >= 0 && index < bulkUpdated.length && bulkUpdated[index]) {
          // Don't allow selecting unsupported components
          if (bulkUpdated[index].compatibilityStatus !== 'unsupported') {
            bulkUpdated[index] = {
              ...bulkUpdated[index],
              isSelected: action.payload.isSelected
            };
          }
        }
      });
      return {
        ...state,
        adfComponents: bulkUpdated,
        selectedComponents: bulkUpdated.filter(c => c && c.isSelected)
      };
    
    case 'TOGGLE_ALL_COMPONENTS':
      const typeToggled = (state.adfComponents || []).map(component => {
        if (component && component.type === action.payload.type && 
            component.compatibilityStatus !== 'unsupported') {
          return { ...component, isSelected: action.payload.isSelected };
        }
        return component;
      });
      return {
        ...state,
        adfComponents: typeToggled,
        selectedComponents: typeToggled.filter(c => c && c.isSelected)
      };
    
    case 'UPDATE_COMPONENT_TARGET':
      const componentsWithUpdatedTarget = [...(state.adfComponents || [])];
      const updateTargetIndex = action.payload.index;
      
      if (updateTargetIndex >= 0 && updateTargetIndex < componentsWithUpdatedTarget.length && componentsWithUpdatedTarget[updateTargetIndex]) {
        componentsWithUpdatedTarget[updateTargetIndex] = {
          ...componentsWithUpdatedTarget[updateTargetIndex],
          fabricTarget: action.payload.fabricTarget
        };
      }
      
      return {
        ...state,
        adfComponents: componentsWithUpdatedTarget,
        selectedComponents: componentsWithUpdatedTarget.filter(c => c && c.isSelected)
      };
    
    case 'BULK_UPDATE_FABRIC_TARGETS':
      const bulkTargetUpdated = [...(state.adfComponents || [])];
      action.payload.forEach(({ mappingIndex, fabricTarget }) => {
        if (mappingIndex >= 0 && mappingIndex < bulkTargetUpdated.length && bulkTargetUpdated[mappingIndex]) {
          bulkTargetUpdated[mappingIndex] = {
            ...bulkTargetUpdated[mappingIndex],
            fabricTarget: fabricTarget
          };
        }
      });
      return {
        ...state,
        adfComponents: bulkTargetUpdated,
        selectedComponents: bulkTargetUpdated.filter(c => c && c.isSelected)
      };
    
    case 'SET_DEPLOYMENT_RESULTS':
      return { ...state, deploymentResults: action.payload || [] };
    
    case 'ADD_DEPLOYMENT_RESULT':
      return { 
        ...state, 
        deploymentResults: [...(state.deploymentResults || []), action.payload] 
      };
    
    case 'SET_CONNECTION_MAPPINGS':
      return { ...state, connectionMappings: action.payload };
    
    case 'SET_LINKED_SERVICES':
      return { 
        ...state, 
        connectionMappings: { 
          ...state.connectionMappings, 
          linkedServices: action.payload || []
        } 
      };
    
    case 'UPDATE_LINKED_SERVICE':
      const updatedLinkedServices = [...(state.connectionMappings?.linkedServices || [])];
      const linkedServiceIndex = action.payload.index;
      
      if (linkedServiceIndex >= 0 && linkedServiceIndex < updatedLinkedServices.length && updatedLinkedServices[linkedServiceIndex]) {
        updatedLinkedServices[linkedServiceIndex] = {
          ...updatedLinkedServices[linkedServiceIndex],
          ...action.payload.update
        };
      }
      
      return {
        ...state,
        connectionMappings: {
          ...state.connectionMappings,
          linkedServices: updatedLinkedServices
        }
      };
    
    case 'SET_AVAILABLE_GATEWAYS':
      return {
        ...state,
        connectionMappings: {
          ...state.connectionMappings,
          availableGateways: action.payload || []
        }
      };
    
    case 'SET_SUPPORTED_CONNECTION_TYPES':
      return {
        ...state,
        connectionMappings: {
          ...state.connectionMappings,
          supportedConnectionTypes: action.payload || []
        }
      };
    
    case 'SET_CONNECTION_DEPLOYMENT_RESULTS':
      return { ...state, connectionDeploymentResults: action.payload || [] };
    
    case 'ADD_CONNECTION_DEPLOYMENT_RESULT':
      return { 
        ...state, 
        connectionDeploymentResults: [...(state.connectionDeploymentResults || []), action.payload] 
      };
    
    case 'SET_PIPELINE_CONNECTION_MAPPINGS':
      return { ...state, pipelineConnectionMappings: action.payload || {} };
    
    case 'UPDATE_PIPELINE_CONNECTION_MAPPING':
      const { pipelineName, activityName, mapping } = action.payload;
      return {
        ...state,
        pipelineConnectionMappings: {
          ...state.pipelineConnectionMappings,
          [pipelineName]: {
            ...state.pipelineConnectionMappings[pipelineName],
            [activityName]: mapping
          }
        }
      };
    
    case 'UPDATE_CUSTOM_ACTIVITY_MAPPING': {
      const { pipelineName: customPipelineName, activityName: customActivityName, reference } = action.payload;
      const existingMapping = state.pipelineConnectionMappings[customPipelineName]?.[customActivityName] || {};
      const existingReferences = existingMapping.customActivityReferences || [];
      
      // Update or add the reference based on location and arrayIndex
      const updatedReferences = [...existingReferences];
      const existingIndex = updatedReferences.findIndex(
        ref => ref.location === reference.location && ref.arrayIndex === reference.arrayIndex
      );
      
      if (existingIndex >= 0) {
        updatedReferences[existingIndex] = reference;
      } else {
        updatedReferences.push(reference);
      }
      
      return {
        ...state,
        pipelineConnectionMappings: {
          ...state.pipelineConnectionMappings,
          [customPipelineName]: {
            ...state.pipelineConnectionMappings[customPipelineName],
            [customActivityName]: {
              ...existingMapping,
              customActivityReferences: updatedReferences
            }
          }
        }
      };
    }
    
    case 'BUILD_LINKEDSERVICE_CONNECTION_BRIDGE':
      return { 
        ...state, 
        linkedServiceConnectionBridge: action.payload || {} 
      };
    
    case 'UPDATE_BRIDGE_MAPPING':
      return {
        ...state,
        linkedServiceConnectionBridge: {
          ...state.linkedServiceConnectionBridge,
          [action.payload.linkedServiceName]: action.payload.mapping
        }
      };
    
    case 'SET_WORKSPACE_CREDENTIALS':
      return { ...state, workspaceCredentials: action.payload };
    
    case 'UPDATE_WORKSPACE_CREDENTIAL':
      const credentials = [...(state.workspaceCredentials?.credentials || [])];
      const credentialIndex = action.payload.index;
      
      if (credentialIndex >= 0 && credentialIndex < credentials.length && credentials[credentialIndex]) {
        credentials[credentialIndex] = { 
          ...credentials[credentialIndex], 
          ...action.payload.update 
        };
      }
      
      return {
        ...state,
        workspaceCredentials: {
          ...state.workspaceCredentials,
          credentials
        }
      };
    
    case 'SET_WORKSPACE_IDENTITY':
      return {
        ...state,
        workspaceCredentials: {
          ...state.workspaceCredentials,
          workspaceIdentity: action.payload
        }
      };
    
    case 'SET_LOADING':
      return { ...state, isLoading: Boolean(action.payload) };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'RESET_STATE':
      return createDefaultAppState();
    
    /** NEW: Folder-related reducer cases */
    case 'SET_FOLDER_HIERARCHY':
      return { ...state, folderHierarchy: action.payload || [] };
    
    case 'SET_FOLDER_MAPPINGS':
      return { ...state, folderMappings: action.payload || {} };
    
    case 'ADD_FOLDER_DEPLOYMENT_RESULT':
      return { 
        ...state, 
        folderDeploymentResults: [...state.folderDeploymentResults, action.payload] 
      };
    
    case 'SET_FOLDER_DEPLOYMENT_RESULTS':
      return { ...state, folderDeploymentResults: action.payload || [] };
    
    /** NEW: Global parameter reducer cases */
    case 'SET_GLOBAL_PARAMETER_REFERENCES':
      return { ...state, globalParameterReferences: action.payload || [] };
    
    case 'SET_VARIABLE_LIBRARY_CONFIG':
      return { ...state, variableLibraryConfig: action.payload };
    
    case 'SET_GLOBAL_PARAMETER_CONFIG_COMPLETED':
      return { ...state, globalParameterConfigCompleted: action.payload };
    
    default:
      return state;
  }
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  
  if (!context.state || !context.dispatch) {
    throw new Error('Invalid app context state');
  }
  
  return context;
}

export function useWizardNavigation() {
  const { state, dispatch } = useAppContext();
  
  const wizardSteps: WizardStep[] = ['upload', 'login', 'workspace', 'managed-identity', 'connections', 'deploy-connections', 'validation', 'global-parameters', 'mapping', 'deployment', 'complete'];
  const currentStepName = wizardSteps[state.currentStep] || 'upload';
  
  const canGoNext = (): boolean => {
    switch (currentStepName) {
      case 'upload':
        return state.uploadedFile !== null && (state.adfComponents?.length || 0) > 0;
        
      case 'login':
        return Boolean(state.auth?.isAuthenticated);
        
      case 'workspace':
        return Boolean(state.selectedWorkspace?.id && state.selectedWorkspace?.hasContributorAccess);
        
      case 'managed-identity':
        // Allow proceeding if no managed identity credentials or workspace identity is configured
        const managedIdentityCredentials = state.workspaceCredentials?.credentials || [];
        return managedIdentityCredentials.length === 0 || managedIdentityCredentials.every(cred => cred?.status === 'configured');
      case 'connections': {
        const linkedServices = state.connectionMappings?.linkedServices || [];
        return linkedServices.length === 0 ||
          linkedServices.every(ls => ls.skip || ls.status === 'configured');
      }
      case 'deploy-connections': {
        const newConnections = (state.connectionMappings?.linkedServices || [])
          .filter(ls => !ls?.skip && ls?.mappingMode === 'new');
        return newConnections.length === 0 || (state.connectionDeploymentResults?.length || 0) > 0;
      }
        
      case 'validation':
        // Allow proceeding if there are components to migrate (excluding system components)
        const migrateableComponents = (state.selectedComponents || []).filter(c => 
          c?.type !== 'linkedService' && 
          c?.type !== 'dataset' && 
          c?.type !== 'managedIdentity'
        );
        return migrateableComponents.length > 0;
        
      case 'global-parameters':
        // Allow proceeding if:
        // 1. No global parameters detected (auto-skip), OR
        // 2. Variable Library deployed or explicitly skipped
        const hasGlobalParams = (state.globalParameterReferences?.length || 0) > 0;
        if (!hasGlobalParams) return true; // No global params, auto-skip this step
        
        // If we have global params, check if they're handled (deployed or skipped)
        return state.globalParameterConfigCompleted === true;
        
      case 'mapping':
        // All migrateable components must have fabric targets configured
        const componentsNeedingTargets = (state.selectedComponents || []).filter(c => 
          c?.type !== 'linkedService' && 
          c?.type !== 'dataset' && 
          c?.type !== 'managedIdentity'
        );
        
        // Check if all components have fabric targets
        const allHaveTargets = componentsNeedingTargets.every(c => c?.fabricTarget);
        
        // For pipelines with invoke activities, check if pipeline connections are mapped
        const pipelinesWithInvokeActivities = componentsNeedingTargets.filter(c => c?.type === 'pipeline');
        const pipelineConnectionsConfigured = Object.keys(state.pipelineConnectionMappings || {}).length === 0 || 
          Object.values(state.pipelineConnectionMappings || {}).every(pipeline => 
            Object.values(pipeline).every(activity => activity.selectedConnectionId)
          );
        
        return allHaveTargets && pipelineConnectionsConfigured;
        
      case 'deployment':
        return (state.deploymentResults?.length || 0) > 0;
        
      case 'complete':
        return false; // Final step
        
      default:
        return false;
    }
  };
  
  const canGoPrevious = (): boolean => {
    return state.currentStep > 0;
  };
  
  const goNext = () => {
    if (canGoNext() && state.currentStep < wizardSteps.length - 1) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep + 1 });
    }
  };
  
  const goPrevious = () => {
    if (canGoPrevious()) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep - 1 });
    }
  };
  
  const goToStep = (step: number) => {
    if (step >= 0 && step < wizardSteps.length) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: step });
    }
  };

  const getNavigationBlockingReason = (step?: number): string => {
    const targetStep = step !== undefined ? step : state.currentStep;
    const stepName = wizardSteps[targetStep];
    
    switch (stepName) {
      case 'login':
        if (!state.auth?.isAuthenticated) {
          return 'Please complete authentication to continue.';
        }
        break;
        
      case 'workspace':
        if (!state.selectedWorkspace) {
          return 'Please select or create a workspace to continue.';
        }
        if (!state.selectedWorkspace.hasContributorAccess) {
          return 'Selected workspace requires contributor access to proceed.';
        }
        break;
        
      case 'upload':
        if (!state.uploadedFile) {
          return 'Please upload an ADF ARM template to continue.';
        }
        if ((state.adfComponents?.length || 0) === 0) {
          return 'No ADF components found in the uploaded template.';
        }
        break;
        
      case 'managed-identity':
        const credentialMappings = state.workspaceCredentials?.credentials || [];
        const unconfiguredCredentials = credentialMappings.filter(cred => cred.status !== 'configured');
        if (unconfiguredCredentials.length > 0) {
          return `${unconfiguredCredentials.length} managed identity credential(s) need configuration.`;
        }
        break;
        
      case 'connections': {
        const linkedServices = state.connectionMappings?.linkedServices || [];
        const unconfigured = linkedServices.filter(ls => !ls.skip && ls.status !== 'configured');
        if (unconfigured.length > 0) {
          return `${unconfigured.length} LinkedService connection(s) need configuration (others may be skipped).`;
        }
        break;
      }
      case 'deploy-connections': {
        const newConnections = (state.connectionMappings?.linkedServices || [])
          .filter(ls => !ls.skip && ls.mappingMode === 'new');
        if (newConnections.length > 0 && (state.connectionDeploymentResults?.length || 0) === 0) {
          return 'Please deploy new (non-skipped) connections before proceeding.';
        }
        break;
      }
        
      case 'validation':
        const migrateableComponents = (state.selectedComponents || []).filter(c => 
          c?.type !== 'linkedService' && 
          c?.type !== 'dataset' && 
          c?.type !== 'managedIdentity'
        );
        if (migrateableComponents.length === 0) {
          return 'Please select at least one component to migrate.';
        }
        break;
        
      case 'global-parameters':
        const hasGlobalParams = (state.globalParameterReferences?.length || 0) > 0;
        if (hasGlobalParams && !state.globalParameterConfigCompleted) {
          return 'Please deploy Variable Library or skip this step to continue.';
        }
        break;
        
      case 'mapping':
        const componentsNeedingTargets = (state.selectedComponents || []).filter(c => 
          c?.type !== 'linkedService' && 
          c?.type !== 'dataset' && 
          c?.type !== 'managedIdentity'
        );
        const componentsWithoutTargets = componentsNeedingTargets.filter(c => !c?.fabricTarget);
        if (componentsWithoutTargets.length > 0) {
          return `${componentsWithoutTargets.length} component(s) need Fabric target mapping.`;
        }
        
        // Check pipeline connection mappings
        const pipelineActivitiesNeedingConnections = Object.values(state.pipelineConnectionMappings || {})
          .flatMap(pipeline => Object.values(pipeline))
          .filter(activity => !activity.selectedConnectionId);
          
        if (pipelineActivitiesNeedingConnections.length > 0) {
          return `${pipelineActivitiesNeedingConnections.length} pipeline activity connection(s) need mapping.`;
        }
        break;
        
      case 'deployment':
        if ((state.deploymentResults?.length || 0) === 0) {
          return 'No deployment has been completed yet.';
        }
        break;
    }
    return '';
  };
  
  // Helper function to check if a step requires configuration
  const stepRequiresConfiguration = (stepName: WizardStep): boolean => {
    switch (stepName) {
      case 'connections':
        return (state.connectionMappings?.linkedServices || []).some(ls => !ls.skip);
      case 'deploy-connections':
        return (state.connectionMappings?.linkedServices || []).some(ls => !ls.skip && ls.mappingMode === 'new');
      default:
        return true;
    }
  };
  
  return {
    currentStep: state.currentStep,
    currentStepName,
    totalSteps: wizardSteps.length,
    wizardSteps,
    canGoNext: canGoNext(),
    canGoPrevious: canGoPrevious(),
    goNext,
    goPrevious,
    goToStep,
    getNavigationBlockingReason,
    stepRequiresConfiguration
  };
}