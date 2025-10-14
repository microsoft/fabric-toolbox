/**
 * Type definitions for external APIs and responses
 */

// Microsoft Fabric API response types
export interface FabricWorkspace {
  id: string;
  displayName: string;
  name?: string; // Some APIs may include both
  description?: string;
  type: string;
}

export interface FabricAPIResponse<T = any> {
  value: T;
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
}

export interface FabricErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{
      code: string;
      message: string;
    }>;
  };
}

// Azure AD OAuth response types
export interface AzureADTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export interface AzureADErrorResponse {
  error: string;
  error_description: string;
  error_codes?: number[];
}

// File API types
export interface FileReadResult {
  content: string;
  size: number;
  lastModified: number;
}

// Local Storage types
export interface StoredAuthData {
  authState: string;
  timestamp: number;
  version: string;
}

// API request options
export interface APIRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | FormData;
  timeout?: number;
}

// Generic API response wrapper
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}