/**
 * Variable Library Service
 * 
 * Handles creation and management of Fabric Variable Libraries for global parameter migration.
 * Constructs Base64-encoded variables.json and settings.json files.
 */

import type {
  GlobalParameterReference,
  VariableLibraryConfig,
  VariableLibraryDefinition,
  VariablesJsonSchema,
  SettingsJsonSchema,
  PipelineLibraryVariable,
  VariableDefinition,
} from '../types';

class VariableLibraryService {
  /**
   * Creates a Variable Library in Fabric workspace
   * @param workspaceId Target Fabric workspace ID
   * @param config Variable library configuration
   * @param accessToken Power BI/Fabric API access token
   * @returns Created library item with fabricItemId
   */
  async createVariableLibrary(
    workspaceId: string,
    config: VariableLibraryConfig,
    accessToken: string
  ): Promise<{ success: boolean; fabricItemId?: string; error?: string }> {
    console.log(`[VariableLibraryService] Creating Variable Library: ${config.displayName}`);

    try {
      // Step 1: Check if library already exists
      const existsCheck = await this.checkLibraryExists(workspaceId, config.displayName, accessToken);
      if (existsCheck.exists) {
        console.error(`[VariableLibraryService] Library "${config.displayName}" already exists`);
        return {
          success: false,
          error: `A Variable Library named "${config.displayName}" already exists in this workspace. Please choose a different name.`,
        };
      }

      // Step 2: Build Variable Library definition
      const definition = this.buildLibraryDefinition(config);

      // Step 3: Base64 encode variables.json and settings.json
      const variablesJsonBase64 = this.encodeToBase64(definition.variablesJson);
      const settingsJsonBase64 = this.encodeToBase64(definition.settingsJson);

      // Step 4: Create Variable Library via Fabric API
      const createPayload = {
        displayName: config.displayName,
        description: config.description,
        definition: {
          format: 'VariableLibraryV1',
          parts: [
            {
              path: 'variables.json',
              payload: variablesJsonBase64,
              payloadType: 'InlineBase64',
            },
            {
              path: 'settings.json',
              payload: settingsJsonBase64,
              payloadType: 'InlineBase64',
            },
          ],
        },
      };

      const apiUrl = `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/VariableLibraries`;
      console.log(`[VariableLibraryService] POST ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(createPayload),
      });

      // Handle 202 Accepted (async operation) or 200/201 (sync operation)
      if (response.status === 202) {
        console.log('[VariableLibraryService] Async operation started (202). Polling for completion...');
        
        // Poll for the library to appear (with timeout)
        const maxAttempts = 10;
        const delayMs = 2000;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          const existsCheck = await this.checkLibraryExists(workspaceId, config.displayName, accessToken);
          
          if (existsCheck.exists && existsCheck.itemId) {
            console.log(`[VariableLibraryService] Library created successfully. Item ID: ${existsCheck.itemId}`);
            return {
              success: true,
              fabricItemId: existsCheck.itemId,
            };
          }
          
          console.log(`[VariableLibraryService] Polling attempt ${attempt}/${maxAttempts}...`);
        }
        
        return {
          success: false,
          error: 'Variable Library creation timed out. Please check Fabric workspace manually.',
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VariableLibraryService] API Error: ${response.status} - ${errorText}`);
        return {
          success: false,
          error: `Failed to create Variable Library: ${response.status} ${response.statusText}`,
        };
      }

      // Handle 200/201 sync response
      const result = await response.json();

      if (!result || !result.id) {
        console.error('[VariableLibraryService] API returned success but no ID in response:', result);
        return {
          success: false,
          error: 'API returned success but no item ID was provided',
        };
      }

      console.log(`[VariableLibraryService] Successfully created library. Item ID: ${result.id}`);

      return {
        success: true,
        fabricItemId: result.id,
      };
    } catch (error: any) {
      console.error('[VariableLibraryService] Error creating Variable Library:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  /**
   * Checks if a Variable Library with the given name already exists in the workspace
   * @param workspaceId Fabric workspace ID
   * @param libraryName Name to check
   * @param accessToken API access token
   * @returns Object indicating existence and item ID if found
   */
  async checkLibraryExists(
    workspaceId: string,
    libraryName: string,
    accessToken: string
  ): Promise<{ exists: boolean; itemId?: string }> {
    try {
      const apiUrl = `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/VariableLibraries`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        console.error(`[VariableLibraryService] Failed to list libraries: ${response.status}`);
        return { exists: false };
      }

      const data = await response.json();
      const existingLibrary = data.value?.find((item: any) => item.displayName === libraryName);

      if (existingLibrary) {
        return { exists: true, itemId: existingLibrary.id };
      }

      return { exists: false };
    } catch (error) {
      console.error('[VariableLibraryService] Error checking library existence:', error);
      return { exists: false };
    }
  }

  /**
   * Builds the Variable Library definition structure
   * @param config Variable library configuration
   * @returns Complete definition with parts containing Base64-encoded JSON
   */
  private buildLibraryDefinition(config: VariableLibraryConfig): { variablesJson: string; settingsJson: string } {
    // Build variables array for variables.json
    const variables: VariableDefinition[] = config.variables.map(ref => {
      let fabricValue: string | number | boolean;

      // Handle data type conversions
      if (ref.adfDataType === 'Array' || ref.adfDataType === 'Object') {
        // Serialize to JSON string
        fabricValue = typeof ref.defaultValue === 'string'
          ? ref.defaultValue
          : JSON.stringify(ref.defaultValue);
      } else if (ref.adfDataType === 'SecureString') {
        // Default to 'SECRET' placeholder - user must update manually
        fabricValue = ref.defaultValue === '' ? 'SECRET' : String(ref.defaultValue);
      } else if (ref.fabricDataType === 'Integer' || ref.fabricDataType === 'Number') {
        fabricValue = typeof ref.defaultValue === 'number' 
          ? ref.defaultValue 
          : parseFloat(String(ref.defaultValue)) || 0;
      } else if (ref.fabricDataType === 'Boolean') {
        fabricValue = Boolean(ref.defaultValue);
      } else {
        fabricValue = String(ref.defaultValue);
      }

      return {
        name: `VariableLibrary_${ref.name}`, // Prefix for uniqueness
        type: ref.fabricDataType,
        value: fabricValue,
        note: ref.note,
      };
    });

    // Build variables.json schema
    const variablesJson: VariablesJsonSchema = {
      $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/variableLibrary/definition/variables/1.0.0/schema.json',
      variables,
    };

    // Build settings.json schema
    const settingsJson: SettingsJsonSchema = {
      $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/variableLibrary/definition/settings/1.0.0/schema.json',
      valueSetsOrder: [],
    };

    return {
      variablesJson: JSON.stringify(variablesJson, null, 2),
      settingsJson: JSON.stringify(settingsJson, null, 2),
    };
  }

  /**
   * Encodes a string to Base64 (UTF-8)
   * @param content String content to encode
   * @returns Base64-encoded string
   */
  private encodeToBase64(content: string): string {
    // Use btoa for browser environment (UTF-8 safe)
    return btoa(unescape(encodeURIComponent(content)));
  }

  /**
   * Generates a default library name based on factory name
   * Format: {FactoryName}_GlobalParameters
   * @param factoryName The ADF factory name
   * @returns Suggested library name
   */
  generateDefaultLibraryName(factoryName: string): string {
    // Sanitize factory name (remove invalid characters)
    const sanitized = factoryName.replace(/[^a-zA-Z0-9_]/g, '');
    return `${sanitized}_GlobalParameters`;
  }

  /**
   * Validates library name format
   * @param name The proposed library name
   * @returns Validation result
   */
  validateLibraryName(name: string): { valid: boolean; error?: string } {
    if (!name || name.trim() === '') {
      return { valid: false, error: 'Library name cannot be empty' };
    }

    if (name.length > 128) {
      return { valid: false, error: 'Library name must be 128 characters or less' };
    }

    // Check for invalid characters (basic validation)
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(name)) {
      return { valid: false, error: 'Library name can only contain letters, numbers, spaces, hyphens, and underscores' };
    }

    return { valid: true };
  }

  /**
   * Extracts factory name from ARM template for default naming
   * @param armTemplate Full ARM template object
   * @returns Factory name or 'DataFactory' fallback
   */
  extractFactoryName(armTemplate: any): string {
    try {
      const factories = armTemplate?.resources?.filter(
        (r: any) => r.type === 'Microsoft.DataFactory/factories'
      ) || [];

      if (factories.length > 0) {
        const factoryName = factories[0]?.name;
        
        if (typeof factoryName === 'string') {
          // Handle "[parameters('factoryName')]" pattern
          const match = factoryName.match(/parameters\('(.+?)'\)/);
          if (match) {
            const paramName = match[1];
            const paramValue = armTemplate?.parameters?.[paramName]?.defaultValue;
            if (paramValue) {
              return paramValue;
            }
          }
          // Direct string name
          return factoryName;
        }
      }
    } catch (error) {
      console.error('[VariableLibraryService] Error extracting factory name:', error);
    }

    return 'DataFactory'; // Fallback
  }
}

// Export singleton instance
export const variableLibraryService = new VariableLibraryService();
