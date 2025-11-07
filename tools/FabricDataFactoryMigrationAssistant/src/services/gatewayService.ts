import { ADFComponent, DeploymentResult } from '../types';
import { fabricApiClient } from './fabricApiClient';

interface GatewayMapping {
  adfName: string;
  fabricId: string;
  gatewayType: 'VirtualNetwork' | 'OnPremises';
}

export class GatewayService {
  private createdGateways: Map<string, GatewayMapping> = new Map();
  private failedGateways: Set<string> = new Set();

  clear() {
    this.createdGateways.clear();
    this.failedGateways.clear();
  }

  getCreatedGateway(adfName: string): GatewayMapping | undefined {
    return this.createdGateways.get(adfName);
  }

  hasFailedGateway(name: string): boolean {
    return this.failedGateways.has(name);
  }

  markFailed(name: string) {
    this.failedGateways.add(name);
  }

  // Create a gateway in Fabric (moved from FabricService)
  async createGateway(component: ADFComponent, accessToken: string): Promise<DeploymentResult> {
    const endpoint = `${fabricApiClient.baseUrl}/gateways`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    try {
      const gatewayType = component.fabricTarget?.gatewayType || 'OnPremises';
      const gatewayPayload = this.createGatewayPayload(component, gatewayType);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(gatewayPayload)
      });

      if (!response.ok) {
        return await fabricApiClient.handleAPIError(
          response, 'POST', endpoint, gatewayPayload, headers,
          component.name, component.type
        );
      }

      const result = await response.json();
      this.createdGateways.set(component.name, {
        adfName: component.name,
        fabricId: result.id,
        gatewayType: gatewayType
      });

      return {
        componentName: component.name,
        componentType: component.type,
        status: 'success',
        fabricResourceId: result.id,
        note: `${gatewayType} gateway created successfully`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating gateway';
      return {
        componentName: component.name,
        componentType: component.type,
        status: 'failed',
        error: errorMessage
      };
    }
  }

  private createGatewayPayload(component: ADFComponent, gatewayType: 'VirtualNetwork' | 'OnPremises'): any {
    const basePayload = {
      displayName: component.fabricTarget?.name || component.name,
      description: `Migrated from ADF Integration Runtime: ${component.name}`
    };

    if (gatewayType === 'VirtualNetwork') {
      return {
        ...basePayload,
        type: 'VirtualNetworkGateway',
        virtualNetworkGatewayDetails: {
          subscriptionId: component.definition?.properties?.typeProperties?.computeProperties?.dataFlowProperties?.computeType || '',
          resourceGroupName: component.definition?.properties?.typeProperties?.computeProperties?.dataFlowProperties?.coreCount || '',
          virtualNetworkName: component.definition?.properties?.typeProperties?.vNetProperties?.vNetId || '',
          subnetName: component.definition?.properties?.typeProperties?.vNetProperties?.subnet || ''
        }
      };
    } else {
      return {
        ...basePayload,
        type: 'OnPremisesGateway',
        onPremisesGatewayDetails: {
          installationId: '',
          version: '3000.0.0',
          status: 'Online'
        }
      };
    }
  }

  // Public accessor used by plan generation to preview gateway payloads
  public getGatewayPayload(component: ADFComponent, gatewayType: 'VirtualNetwork' | 'OnPremises'): any {
    return this.createGatewayPayload(component, gatewayType);
  }
}

export const gatewayService = new GatewayService();
