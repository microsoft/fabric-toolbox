/**
 * Service for listing and caching Fabric connections
 * Handles pagination and provides caching functionality
 */

import type { ExistingFabricConnection, ExistingConnectionsResponse } from '../types';

export interface FabricConnection {
  id: string;
  displayName: string;
  connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway';
  connectionDetails: {
    type: string;
    path?: string;
    [key: string]: any;
  };
  gatewayId?: string;
  description?: string;
  privacyLevel?: 'Public' | 'Organizational' | 'Private';
  credentialDetails?: {
    credentialType: string;
    singleSignOnType: string;
    connectionEncryption: string;
    skipTestConnection: boolean;
  };
}

export interface ConnectionsListResult {
  connections: FabricConnection[];
  totalCount: number;
  hasMore: boolean;
  continuationToken?: string;
}

interface CachedConnections {
  connections: FabricConnection[];
  timestamp: number;
}

export class ConnectionsListService {
  private cache: Map<string, CachedConnections> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all connections for the current workspace
   */
  async getAllConnections(accessToken: string): Promise<ConnectionsListResult> {
    const cacheKey = 'all-connections';
    const cached = this.cache.get(cacheKey);
    
    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return {
        connections: cached.connections,
        totalCount: cached.connections.length,
        hasMore: false
      };
    }

    try {
      const allConnections: FabricConnection[] = [];
      let hasMore = true;
      let continuationToken: string | undefined;

      while (hasMore) {
        const url = new URL('https://api.fabric.microsoft.com/v1/connections');
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
          throw new Error(`Failed to fetch connections: ${response.status} ${response.statusText}. ${errorText}`);
        }

        const data: ExistingConnectionsResponse = await response.json();
        
        if (Array.isArray(data.value)) {
          allConnections.push(...data.value.filter(this.validateConnection));
        }

        continuationToken = data.continuationToken;
        hasMore = !!continuationToken;
      }

      // Cache the results
      this.cache.set(cacheKey, {
        connections: allConnections,
        timestamp: Date.now()
      });

      return {
        connections: allConnections,
        totalCount: allConnections.length,
        hasMore: false
      };

    } catch (error) {
      console.error('Error fetching all connections:', error);
      throw error;
    }
  }

  /**
   * Get connections filtered by type
   */
  async getConnectionsByType(
    accessToken: string, 
    connectionType: string
  ): Promise<ConnectionsListResult> {
    const allConnections = await this.getAllConnections(accessToken);
    
    const filteredConnections = allConnections.connections.filter(
      conn => conn.connectionDetails.type.toLowerCase() === connectionType.toLowerCase()
    );

    return {
      connections: filteredConnections,
      totalCount: filteredConnections.length,
      hasMore: false
    };
  }

  /**
   * Get connections filtered by connectivity type
   */
  async getConnectionsByConnectivity(
    accessToken: string,
    connectivityType: 'ShareableCloud' | 'OnPremisesGateway' | 'VirtualNetworkGateway'
  ): Promise<ConnectionsListResult> {
    const allConnections = await this.getAllConnections(accessToken);
    
    const filteredConnections = allConnections.connections.filter(
      conn => conn.connectivityType === connectivityType
    );

    return {
      connections: filteredConnections,
      totalCount: filteredConnections.length,
      hasMore: false
    };
  }

  /**
   * Search connections by name or type
   */
  async searchConnections(
    accessToken: string,
    searchTerm: string
  ): Promise<ConnectionsListResult> {
    const allConnections = await this.getAllConnections(accessToken);
    
    if (!searchTerm.trim()) {
      return allConnections;
    }

    const term = searchTerm.toLowerCase().trim();
    const filteredConnections = allConnections.connections.filter(conn =>
      conn.displayName.toLowerCase().includes(term) ||
      conn.connectionDetails.type.toLowerCase().includes(term) ||
      (conn.description && conn.description.toLowerCase().includes(term))
    );

    return {
      connections: filteredConnections,
      totalCount: filteredConnections.length,
      hasMore: false
    };
  }

  /**
   * Get single connection by ID
   */
  async getConnectionById(
    accessToken: string,
    connectionId: string
  ): Promise<FabricConnection | null> {
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
   * Format connection for display
   */
  formatConnectionForDisplay(connection: FabricConnection): string {
    const typeInfo = connection.connectionDetails.type;
    const connectivityInfo = this.formatConnectivityType(connection.connectivityType);
    return `${connection.displayName} - ${typeInfo} (${connectivityInfo})`;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Validate connection object
   */
  private validateConnection(connection: any): connection is FabricConnection {
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
   * Format connectivity type for display
   */
  private formatConnectivityType(connectivityType: string): string {
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
}

// Export singleton instance
export const connectionsListService = new ConnectionsListService();