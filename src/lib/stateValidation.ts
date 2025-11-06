/**
 * Application state validation schemas
 * Provides runtime validation for complex application state to prevent type errors
 */

import { 
  AppState, 
  AuthState, 
  ADFComponent, 
  FabricTarget, 
  DeploymentResult,
  ServicePrincipalAuth,
  WorkspaceInfo
} from '../types';

/**
 * Validate AuthState object
 */
export function validateAuthState(obj: any): obj is AuthState {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.isAuthenticated === 'boolean' &&
    (obj.accessToken === null || typeof obj.accessToken === 'string') &&
    (obj.user === null || (
      typeof obj.user === 'object' &&
      obj.user !== null &&
      typeof obj.user.id === 'string' &&
      typeof obj.user.name === 'string' &&
      typeof obj.user.email === 'string' &&
      typeof obj.user.tenantId === 'string'
    )) &&
    (obj.workspaceId === null || typeof obj.workspaceId === 'string') &&
    typeof obj.hasContributorAccess === 'boolean' &&
    // Enhanced: Validate optional tokenScopes property
    (obj.tokenScopes === undefined || (
      typeof obj.tokenScopes === 'object' &&
      obj.tokenScopes !== null &&
      typeof obj.tokenScopes.connectionReadWrite === 'boolean' &&
      typeof obj.tokenScopes.gatewayReadWrite === 'boolean' &&
      typeof obj.tokenScopes.itemReadWrite === 'boolean' &&
      typeof obj.tokenScopes.hasAllRequiredScopes === 'boolean' &&
      Array.isArray(obj.tokenScopes.scopes) &&
      obj.tokenScopes.scopes.every((scope: any) => scope === null || typeof scope === 'string')
    ))
  );
}

/**
 * Validate ADFComponent object
 */
export function validateADFComponent(obj: any): obj is ADFComponent {
  const validTypes = ['pipeline', 'dataset', 'linkedService', 'trigger', 'globalParameter', 'integrationRuntime', 'mappingDataFlow', 'customActivity'];
  const validStatuses = ['supported', 'partiallySupported', 'unsupported'];
  
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.name === 'string' &&
    validTypes.includes(obj.type) &&
    typeof obj.definition === 'object' &&
    obj.definition !== null &&
    typeof obj.isSelected === 'boolean' &&
    validStatuses.includes(obj.compatibilityStatus) &&
    Array.isArray(obj.warnings) &&
    obj.warnings.every((w: any) => w === null || typeof w === 'string') &&
    (obj.fabricTarget === undefined || validateFabricTarget(obj.fabricTarget))
  );
}

/**
 * Validate FabricTarget object
 */
export function validateFabricTarget(obj: any): obj is FabricTarget {
  const validTypes = ['dataPipeline', 'connector', 'variable', 'schedule', 'notebook', 'dataGateway'];
  
  return (
    typeof obj === 'object' &&
    obj !== null &&
    validTypes.includes(obj.type) &&
    typeof obj.name === 'string' &&
    (obj.configuration === undefined || (typeof obj.configuration === 'object' && obj.configuration !== null))
  );
}

/**
 * Validate DeploymentResult object
 */
export function validateDeploymentResult(obj: any): obj is DeploymentResult {
  const validStatuses = ['success', 'failed', 'skipped'];
  
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.componentName === 'string' &&
    typeof obj.componentType === 'string' &&
    validStatuses.includes(obj.status) &&
    (obj.fabricResourceId === undefined || typeof obj.fabricResourceId === 'string') &&
    (obj.errorMessage === undefined || typeof obj.errorMessage === 'string')
  );
}

/**
 * Validate WorkspaceInfo object
 */
export function validateWorkspaceInfo(obj: any): obj is WorkspaceInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    (obj.description === undefined || typeof obj.description === 'string') &&
    typeof obj.type === 'string' &&
    typeof obj.hasContributorAccess === 'boolean'
  );
}
export function validateServicePrincipalAuth(obj: any): obj is ServicePrincipalAuth {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.tenantId === 'string' &&
    typeof obj.clientId === 'string' &&
    typeof obj.clientSecret === 'string'
  );
}

/**
 * Validate AppState object with comprehensive checks
 */
export function validateAppState(obj: any): obj is AppState {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.currentStep === 'number' &&
    obj.currentStep >= 0 &&
    obj.currentStep <= 10 && // 11 total steps: upload through complete
    validateAuthState(obj.auth) &&
    (obj.selectedWorkspace === null || validateWorkspaceInfo(obj.selectedWorkspace)) &&
    Array.isArray(obj.availableWorkspaces) &&
    obj.availableWorkspaces.every((w: any) => w === null || validateWorkspaceInfo(w)) &&
    (obj.uploadedFile === null || obj.uploadedFile instanceof File) &&
    Array.isArray(obj.adfComponents) &&
    obj.adfComponents.every((c: any) => c === null || validateADFComponent(c)) &&
    Array.isArray(obj.selectedComponents) &&
    obj.selectedComponents.every((c: any) => c === null || validateADFComponent(c)) &&
    Array.isArray(obj.deploymentResults) &&
    obj.deploymentResults.every((r: any) => r === null || validateDeploymentResult(r)) &&
    typeof obj.isLoading === 'boolean' &&
    (obj.error === null || typeof obj.error === 'string')
  );
}

/**
 * Sanitize and validate partial app state updates
 */
export function sanitizeAppStateUpdate(update: Partial<AppState>): Partial<AppState> {
  const sanitized: Partial<AppState> = {};
  
  if (update.currentStep !== undefined) {
    const step = Math.max(0, Math.min(10, Math.floor(Number(update.currentStep) || 0))); // Max step is 10 (complete)
    sanitized.currentStep = step;
  }
  
  if (update.auth !== undefined && validateAuthState(update.auth)) {
    sanitized.auth = update.auth;
  }
  
  if (update.selectedWorkspace !== undefined) {
    sanitized.selectedWorkspace = update.selectedWorkspace && validateWorkspaceInfo(update.selectedWorkspace) 
      ? update.selectedWorkspace 
      : null;
  }
  
  if (update.availableWorkspaces !== undefined && Array.isArray(update.availableWorkspaces)) {
    sanitized.availableWorkspaces = update.availableWorkspaces.filter(validateWorkspaceInfo);
  }
  
  if (update.uploadedFile !== undefined) {
    sanitized.uploadedFile = update.uploadedFile instanceof File ? update.uploadedFile : null;
  }
  
  if (update.adfComponents !== undefined && Array.isArray(update.adfComponents)) {
    sanitized.adfComponents = update.adfComponents.filter(validateADFComponent);
  }
  
  if (update.selectedComponents !== undefined && Array.isArray(update.selectedComponents)) {
    sanitized.selectedComponents = update.selectedComponents.filter(validateADFComponent);
  }
  
  if (update.deploymentResults !== undefined && Array.isArray(update.deploymentResults)) {
    sanitized.deploymentResults = update.deploymentResults.filter(validateDeploymentResult);
  }
  
  if (update.isLoading !== undefined) {
    sanitized.isLoading = Boolean(update.isLoading);
  }
  
  if (update.error !== undefined) {
    sanitized.error = typeof update.error === 'string' ? update.error : null;
  }
  
  return sanitized;
}

/**
 * Create a safe default AppState
 */
export function createDefaultAppState(): AppState {
  return {
    currentStep: 0,
    auth: {
      isAuthenticated: false,
      accessToken: null,
      user: null,
      workspaceId: null,
      hasContributorAccess: false
    },
    selectedWorkspace: null,
    availableWorkspaces: [],
    uploadedFile: null,
    adfComponents: [],
    selectedComponents: [],
    adfProfile: null,
    connectionMappings: {
      linkedServices: [],
      availableGateways: [],
      supportedConnectionTypes: [],
      isLoading: false,
      error: null
    },
    pipelineConnectionMappings: {},
    pipelineReferenceMappings: {},
    linkedServiceConnectionBridge: {},
    workspaceCredentials: {
      credentials: [],
      isLoading: false,
      error: null
    },
    deploymentResults: [],
    connectionDeploymentResults: [],
    isLoading: false,
    error: null,
    /** NEW: Folder-related state initialization */
    folderHierarchy: [],
    folderMappings: {},
    folderDeploymentResults: [],
    /** NEW: Global parameter state initialization */
    globalParameterReferences: [],
    variableLibraryConfig: null,
    globalParameterConfigCompleted: false
  };
}