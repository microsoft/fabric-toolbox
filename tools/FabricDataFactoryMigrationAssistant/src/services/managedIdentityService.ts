import { authService } from './authService';
import { workspaceIdentityService, WorkspaceIdentityInfo, WorkspaceCredentialMapping } from './workspaceIdentityService';
import { adfParserService } from './adfParserService';
import type { ADFComponent } from '../types';

export interface ManagedIdentityConfig {
  hasWorkspaceIdentity: boolean;
  workspaceIdentity?: WorkspaceIdentityInfo;
  credentialMappings: WorkspaceCredentialMapping[];
  isConfigured: boolean;
}

export interface ManagedIdentityRequirement {
  workspaceId: string;
  componentName: string;
  componentType: 'ADF' | 'Synapse';
  credentialType: 'ManagedIdentity';
  resourceType: string;
}

class ManagedIdentityService {
  /**
   * Analyze ARM template for managed identity requirements
   * @param adfComponents Parsed ADF components from ARM template
   * @returns Requirements for managed identity configuration
   */
  analyzeManagedIdentityRequirements(adfComponents: ADFComponent[]): ManagedIdentityRequirement[] {
    const requirements: ManagedIdentityRequirement[] = [];

    try {
      console.log('Analyzing ARM template for managed identity requirements...');

      for (const component of adfComponents) {
        if (!component?.definition) continue;

        // Check for Synapse workspace credentials with ManagedIdentity type
        if (this.isSynapseCredential(component)) {
          console.log(`Found Synapse ManagedIdentity credential: ${component.name}`);
          
          requirements.push({
            workspaceId: '', // Will be filled when workspace is selected
            componentName: component.name,
            componentType: 'Synapse',
            credentialType: 'ManagedIdentity',
            resourceType: 'Microsoft.Synapse/workspaces/credentials'
          });
        }
        
        // Check for ADF credentials with ManagedIdentity type
        else if (this.isADFCredential(component)) {
          console.log(`Found ADF ManagedIdentity credential: ${component.name}`);
          
          requirements.push({
            workspaceId: '', // Will be filled when workspace is selected
            componentName: component.name,
            componentType: 'ADF',
            credentialType: 'ManagedIdentity',
            resourceType: 'Microsoft.DataFactory/factories/credentials'
          });
        }
      }

      console.log(`Found ${requirements.length} managed identity requirements`);
      return requirements;

    } catch (error) {
      console.error('Error analyzing managed identity requirements:', error);
      throw new Error(`Failed to analyze managed identity requirements: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure managed identity for a workspace
   * @param workspaceId The workspace ID
   * @param requirements The managed identity requirements
   * @returns Configuration result
   */
  async configureManagedIdentity(workspaceId: string, requirements: ManagedIdentityRequirement[]): Promise<ManagedIdentityConfig> {
    try {
      console.log(`Configuring managed identity for workspace: ${workspaceId}`);

      if (requirements.length === 0) {
        console.log('No managed identity requirements found');
        return {
          hasWorkspaceIdentity: false,
          credentialMappings: [],
          isConfigured: true
        };
      }

      // Check if workspace identity already exists first
      let workspaceIdentity: WorkspaceIdentityInfo;
      
      try {
        console.log('Checking for existing workspace identity...');
        const workspaceDetails = await workspaceIdentityService.getWorkspaceDetails(workspaceId);
        
        if (workspaceDetails.workspaceIdentity) {
          console.log('✅ Using existing workspace identity');
          workspaceIdentity = workspaceDetails.workspaceIdentity;
        } else {
          console.log('Creating new workspace identity...');
          workspaceIdentity = await workspaceIdentityService.ensureWorkspaceIdentity(workspaceId);
        }
      } catch (error) {
        console.error('Failed to configure workspace identity:', error);
        throw new Error(`Failed to configure workspace identity: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Create credential mappings for each requirement
      const credentialMappings: WorkspaceCredentialMapping[] = requirements.map(req => ({
        sourceName: req.componentName,
        sourceType: 'ManagedIdentity',
        targetApplicationId: workspaceIdentity.applicationId,
        status: 'configured' as const,
        validationErrors: []
      }));

      console.log(`Successfully configured managed identity with ${credentialMappings.length} credential mappings`);

      return {
        hasWorkspaceIdentity: true,
        workspaceIdentity,
        credentialMappings,
        isConfigured: true
      };

    } catch (error) {
      console.error('Error configuring managed identity:', error);
      throw error;
    }
  }

  /**
   * Validate managed identity configuration
   * @param workspaceId The workspace ID
   * @param config The managed identity configuration
   * @returns Validation result
   */
  async validateConfiguration(workspaceId: string, config: ManagedIdentityConfig): Promise<boolean> {
    try {
      console.log('Validating managed identity configuration...');

      if (!config.isConfigured) {
        console.warn('Configuration is not complete');
        return false;
      }

      if (config.hasWorkspaceIdentity && config.workspaceIdentity) {
        // Validate workspace identity exists and is accessible
        const isValid = await workspaceIdentityService.validateWorkspaceIdentity(workspaceId);
        
        if (!isValid) {
          console.error('Workspace identity validation failed');
          return false;
        }

        // Validate all credential mappings
        const hasValidMappings = config.credentialMappings.every(mapping => 
          mapping.status === 'configured' && 
          mapping.targetApplicationId === config.workspaceIdentity?.applicationId
        );

        if (!hasValidMappings) {
          console.error('One or more credential mappings are invalid');
          return false;
        }
      }

      console.log('✅ Managed identity configuration is valid');
      return true;

    } catch (error) {
      console.error('Error validating managed identity configuration:', error);
      return false;
    }
  }

  /**
   * Get workspace identity for use in connection authentication
   * @param workspaceId The workspace ID
   * @returns Workspace identity information
   */
  async getWorkspaceIdentityForAuthentication(workspaceId: string): Promise<WorkspaceIdentityInfo | null> {
    try {
      const workspaceDetails = await workspaceIdentityService.getWorkspaceDetails(workspaceId);
      return workspaceDetails.workspaceIdentity || null;
    } catch (error) {
      console.error('Failed to get workspace identity for authentication:', error);
      return null;
    }
  }

  /**
   * Check if a component is a Synapse credential with ManagedIdentity type
   */
  private isSynapseCredential(component: ADFComponent): boolean {
    return (
      component.definition?.resourceMetadata?.armResourceType === 'Microsoft.Synapse/workspaces/credentials' &&
      component.definition?.properties?.type === 'ManagedIdentity'
    );
  }

  /**
   * Check if a component is an ADF credential with ManagedIdentity type  
   */
  private isADFCredential(component: ADFComponent): boolean {
    return (
      component.type === 'globalParameter' &&
      component.definition?.type === 'credential' &&
      component.definition?.properties?.type === 'ManagedIdentity'
    );
  }

  /**
   * Process ARM template and extract managed identity configuration requirements
   * @param armTemplateComponents Parsed ARM template components
   * @returns Managed identity requirements and suggested configuration
   */
  processARMTemplateForManagedIdentity(armTemplateComponents: ADFComponent[]): {
    requiresConfiguration: boolean;
    requirements: ManagedIdentityRequirement[];
    suggestedAction: string;
  } {
    const requirements = this.analyzeManagedIdentityRequirements(armTemplateComponents);
    
    if (requirements.length === 0) {
      return {
        requiresConfiguration: false,
        requirements: [],
        suggestedAction: 'No managed identity configuration required'
      };
    }

    const synapseCount = requirements.filter(r => r.componentType === 'Synapse').length;
    const adfCount = requirements.filter(r => r.componentType === 'ADF').length;

    let suggestedAction = `Configure workspace identity for ${requirements.length} managed identity credential(s)`;
    
    if (synapseCount > 0 && adfCount > 0) {
      suggestedAction += ` (${synapseCount} Synapse, ${adfCount} ADF)`;
    } else if (synapseCount > 0) {
      suggestedAction += ` (${synapseCount} Synapse)`;
    } else {
      suggestedAction += ` (${adfCount} ADF)`;
    }

    return {
      requiresConfiguration: true,
      requirements,
      suggestedAction
    };
  }
}

export const managedIdentityService = new ManagedIdentityService();