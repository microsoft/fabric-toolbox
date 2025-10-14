/**
 * Implements Fabric List Connections API functionality
 * Retrieves existing connections from the workspace and provides utilities for filtering and display
 */

export interface ExistingFabricConnection {
  id: string;
  displayName: string;
  connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
  connectionDetails: {
    type: string;
    path?: string;
  };
  gatewayId?: string;
  description?: string;
  privacyLevel?: 'Public' | 'Organizational' | 'Private';
}

export interface ExistingConnectionsResponse {
  value: ExistingFabricConnection[];
  continuationToken?: string;
  continuationUri?: string;
}

export interface ConnectionListFilters {
  connectivityType?: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
  connectionType?: string;
  gatewayId?: string;
}

export class ExistingConnectionsService {
  /**
   * Retrieves all existing Fabric connections in the workspace
   * Handles pagination via continuationToken
   */
  static async getExistingConnections(
    accessToken: string,
    workspaceId?: string,
    filters?: ConnectionListFilters
  ): Promise<ExistingFabricConnection[]> {
    const allConnections: ExistingFabricConnection[] = [];
    let continuationToken: string | undefined;
    let hasMore = true;

    while (hasMore) {
      try {
        // Build URL with query parameters
        const url = new URL('https://api.fabric.microsoft.com/v1/connections');
        
        // Add workspace ID if provided
        if (workspaceId) {
          url.searchParams.append('workspaceId', workspaceId);
        }
        
        // Add filters
        if (filters?.connectivityType) {
          url.searchParams.append('connectivityType', filters.connectivityType);
        }
        if (filters?.connectionType) {
          url.searchParams.append('connectionType', filters.connectionType);
        }
        if (filters?.gatewayId) {
          url.searchParams.append('gatewayId', filters.gatewayId);
        }
        
        // Add continuation token for pagination
        if (continuationToken) {
          url.searchParams.append('continuationToken', continuationToken);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch existing connections: ${response.status} ${response.statusText}. ${errorText}`);
        }

        const data: ExistingConnectionsResponse = await response.json();
        
        // Validate and add connections to the list
        if (Array.isArray(data.value)) {
          allConnections.push(...data.value.filter(this.validateConnection));
        }

        // Check for more pages
        continuationToken = data.continuationToken;
        hasMore = !!continuationToken;

      } catch (error) {
        console.error('Error fetching existing connections:', error);
        throw error;
      }
    }

    return allConnections;
  }

  /**
   * Validates that a connection object has required properties
   */
  private static validateConnection(connection: any): connection is ExistingFabricConnection {
    return (
      connection &&
      typeof connection.id === 'string' &&
      typeof connection.displayName === 'string' &&
      typeof connection.connectivityType === 'string' &&
      connection.connectionDetails &&
      typeof connection.connectionDetails.type === 'string'
    );
  }

  /**
   * Formats connection for display in dropdown
   */
  static formatConnectionForDisplay(connection: ExistingFabricConnection): string {
    const typeInfo = connection.connectionDetails.type;
    const connectivityInfo = this.formatConnectivityType(connection.connectivityType);
    return `${connection.displayName} - ${typeInfo} (${connectivityInfo})`;
  }

  /**
   * Formats connectivity type for display
   */
  static formatConnectivityType(connectivityType: string): string {
    switch (connectivityType) {
      case 'ShareableCloud':
        return 'Cloud';
      case 'OnPremisesGateway':
        return 'On-Premises Gateway';
      case 'VirtualNetworkGateway':
        return 'Virtual Network Gateway';
      default:
        return connectivityType;
    }
  }

  /**
   * Filters connections by type or connectivity
   */
  static filterConnections(
    connections: ExistingFabricConnection[],
    filters: ConnectionListFilters
  ): ExistingFabricConnection[] {
    return connections.filter(connection => {
      if (filters.connectivityType && connection.connectivityType !== filters.connectivityType) {
        return false;
      }
      if (filters.connectionType && connection.connectionDetails.type !== filters.connectionType) {
        return false;
      }
      if (filters.gatewayId && connection.gatewayId !== filters.gatewayId) {
        return false;
      }
      return true;
    });
  }

  /**
   * Gets connection by ID
   */
  static async getConnectionById(
    accessToken: string,
    connectionId: string
  ): Promise<ExistingFabricConnection | null> {
    try {
      const response = await fetch(`https://api.fabric.microsoft.com/v1/connections/${connectionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorText = await response.text();
        throw new Error(`Failed to fetch connection ${connectionId}: ${response.status} ${response.statusText}. ${errorText}`);
      }

      const connection = await response.json();
      return this.validateConnection(connection) ? connection : null;

    } catch (error) {
      console.error(`Error fetching connection ${connectionId}:`, error);
      throw error;
    }
  }

  /**
   * Groups connections by type for easier browsing
   */
  static groupConnectionsByType(connections: ExistingFabricConnection[]): Record<string, ExistingFabricConnection[]> {
    const grouped: Record<string, ExistingFabricConnection[]> = {};
    
    connections.forEach(connection => {
      const type = connection.connectionDetails.type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(connection);
    });

    return grouped;
  }

  /**
   * Searches connections by name or type
   */
  static searchConnections(
    connections: ExistingFabricConnection[],
    searchTerm: string
  ): ExistingFabricConnection[] {
    if (!searchTerm.trim()) {
      return connections;
    }

    const term = searchTerm.toLowerCase().trim();
    return connections.filter(connection =>
      connection.displayName.toLowerCase().includes(term) ||
      connection.connectionDetails.type.toLowerCase().includes(term) ||
      (connection.description && connection.description.toLowerCase().includes(term))
    );
  }
}