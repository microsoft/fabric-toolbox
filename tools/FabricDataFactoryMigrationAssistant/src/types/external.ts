/**
 * External API response types for Microsoft Fabric
 */

export interface FabricWorkspace {
  id: string;
  name: string; // Added for compatibility
  displayName: string;
  description?: string;
  type: string;
  isOnDedicatedCapacity: boolean;
  capacityId?: string;
}

export interface WorkspaceUser {
  workspaceId: string;
  identifier: string;
  principalType: 'User' | 'Group' | 'ServicePrincipal';
  displayName: string;
  emailAddress?: string;
  graphId: string;
  userType?: string;
  profile?: {
    id: string;
    displayName: string;
  };
  groupUserAccessRight: 'None' | 'Viewer' | 'Contributor' | 'Member' | 'Admin';
}

export interface WorkspaceUsersResponse {
  workspaceUsers: WorkspaceUser[];
  '@odata.count'?: number;
  '@odata.nextLink'?: string;
}

export interface WorkspaceAccess {
  workspaceId: string;
  user: {
    id: string;
    type: 'User' | 'Group' | 'ServicePrincipal';
    displayName: string;
  };
  groupUserAccessRight: 'None' | 'Viewer' | 'Contributor' | 'Member' | 'Admin';
}

export interface APIResponse<T> {
  value?: T[];
  '@odata.count'?: number;
  '@odata.nextLink'?: string;
}

export interface FabricAPIError {
  error: {
    code: string;
    message: string;
    details?: Array<{
      code: string;
      message: string;
      target?: string;
    }>;
  };
}

export interface FabricDataPipeline {
  id: string;
  displayName: string;
  description?: string;
  workspaceId: string;
  objectId: string;
  definition?: {
    parts: Array<{
      path: string;
      payload: string;
      payloadType: string;
    }>;
  };
}

export interface FabricConnection {
  id: string;
  displayName: string;
  connectionType: string;
  workspaceId: string;
  credentialType?: string;
  encryptedCredential?: string;
  properties?: Record<string, any>;
}

export interface FabricSchedule {
  id: string;
  displayName: string;
  workspaceId: string;
  targetItemId: string;
  targetItemType: string;
  frequency: {
    interval: number;
    frequencyType: 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month';
    startTime: string;
    endTime?: string;
    timeZone?: string;
  };
  enabled: boolean;
}

export interface DeploymentResult {
  id: string;
  name: string;
  type: string;
  status: 'success' | 'failure' | 'warning';
  message?: string;
  fabricId?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface WorkspacePermission {
  workspaceId: string;
  principalId: string;
  principalType: 'User' | 'Group' | 'ServicePrincipal';
  accessRight: 'None' | 'Viewer' | 'Contributor' | 'Member' | 'Admin';
}