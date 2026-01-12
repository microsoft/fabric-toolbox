import { ApiError } from '../types';

interface CreateWorkspaceRequest {
  displayName: string;
}

interface CreateWorkspaceResponse {
  id: string;
  displayName: string;
  description: string;
  type: string;
}

/**
 * Service for managing Microsoft Fabric workspace operations
 */
export class FabricWorkspaceService {
  private baseUrl = 'https://api.fabric.microsoft.com/v1';

  /**
   * Create a new Microsoft Fabric workspace
   * @param displayName - The display name for the new workspace
   * @param accessToken - OAuth access token for authentication
   * @returns Promise resolving to the created workspace details
   */
  async createWorkspace(displayName: string, accessToken: string): Promise<CreateWorkspaceResponse> {
    if (!displayName?.trim()) {
      throw new Error('Workspace display name is required');
    }

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    const endpoint = `${this.baseUrl}/workspaces`;
    const payload: CreateWorkspaceRequest = {
      displayName: displayName.trim()
    };

    console.log('Creating new Fabric workspace:', {
      endpoint,
      displayName: payload.displayName
    });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // Handle success response
      if (response.ok) {
        const result: CreateWorkspaceResponse = await response.json();
        
        console.log('Successfully created workspace:', {
          id: result.id,
          displayName: result.displayName,
          type: result.type
        });

        return result;
      }

      // Handle error response
      const errorText = await response.text();
      let errorData: any = {};
      
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If response is not JSON, use the raw text
        errorData = { message: errorText };
      }

      console.error('Failed to create workspace:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        endpoint,
        payload: { displayName: payload.displayName }
      });

      // Create descriptive error message based on status code
      let errorMessage = `Failed to create workspace "${payload.displayName}"`;
      
      switch (response.status) {
        case 400:
          errorMessage += ': Invalid request. Please check the workspace name.';
          break;
        case 401:
          errorMessage += ': Authentication failed. Please sign in again.';
          break;
        case 403:
          errorMessage += ': You do not have permission to create workspaces.';
          break;
        case 409:
          errorMessage += ': A workspace with this name already exists.';
          break;
        case 429:
          errorMessage += ': Too many requests. Please try again later.';
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          errorMessage += ': Server error. Please try again later.';
          break;
        default:
          errorMessage += `: ${response.status} ${response.statusText}`;
          break;
      }

      // Include API error details if available
      if (errorData.error?.message || errorData.message) {
        errorMessage += ` Details: ${errorData.error?.message || errorData.message}`;
      }

      const apiError: ApiError = {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        method: 'POST',
        payload: payload,
        headers: { 'Authorization': 'Bearer [REDACTED]', 'Content-Type': 'application/json' }
      };

      throw new Error(errorMessage);
    } catch (error) {
      // Handle network errors or other exceptions
      if (error instanceof Error && error.message.includes('Failed to create workspace')) {
        // Re-throw our custom error as-is
        throw error;
      }

      // Handle fetch errors (network issues, etc.)
      const networkError = error instanceof Error ? error.message : 'Unknown network error';
      console.error('Network error creating workspace:', {
        error: networkError,
        endpoint,
        payload: { displayName: payload.displayName }
      });

      throw new Error(`Network error creating workspace "${payload.displayName}": ${networkError}`);
    }
  }

  /**
   * Validate workspace name before creation
   * @param displayName - The proposed workspace name
   * @returns Validation result with any issues
   */
  validateWorkspaceName(displayName: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!displayName) {
      errors.push('Workspace name is required');
    } else {
      const trimmedName = displayName.trim();
      
      if (trimmedName.length === 0) {
        errors.push('Workspace name cannot be empty');
      } else if (trimmedName.length > 256) {
        errors.push('Workspace name must be 256 characters or less');
      } else if (trimmedName.length < 1) {
        errors.push('Workspace name must be at least 1 character');
      }

      // Check for invalid characters (basic validation)
      const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
      if (invalidChars.test(trimmedName)) {
        errors.push('Workspace name contains invalid characters');
      }

      // Check for reserved names (common system reserved names)
      const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
      if (reservedNames.includes(trimmedName.toUpperCase())) {
        errors.push('Workspace name uses a reserved system name');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const fabricWorkspaceService = new FabricWorkspaceService();