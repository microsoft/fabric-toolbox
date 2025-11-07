/**
 * Folder Deployment Service
 * 
 * Handles deployment of folder structures to Microsoft Fabric workspace.
 * Ensures folders are created in correct order (parent before child).
 */

import {
  ADFFolderInfo,
  FabricFolder,
  FolderDeploymentResult,
  FolderTreeNode
} from '../types';
import { getFoldersInDeploymentOrder } from './folderAnalysisService';

/** Base URL for Fabric API */
const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';

/**
 * Create a single folder in Fabric workspace
 * 
 * @param workspaceId - Fabric workspace ID
 * @param folderName - Display name for the folder
 * @param parentFolderId - Parent folder ID (undefined for root folders)
 * @param accessToken - Bearer token for authentication
 * @returns Created folder information
 */
export async function createFolder(
  workspaceId: string,
  folderName: string,
  parentFolderId: string | undefined,
  accessToken: string
): Promise<FabricFolder> {
  const url = `${FABRIC_API_BASE}/workspaces/${workspaceId}/folders`;
  
  const requestBody: any = {
    displayName: folderName
  };
  
  // Only include parentFolderId if it's defined (for nested folders)
  if (parentFolderId) {
    requestBody.parentFolderId = parentFolderId;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create folder "${folderName}": ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    id: data.id,
    displayName: folderName,
    path: '', // Will be set by caller
    parentFolderId,
    depth: 0, // Will be set by caller
    deploymentStatus: 'created'
  };
}

/**
 * Deploy all folders in correct hierarchical order
 * 
 * @param folders - Array of folder information objects (already flattened if needed)
 * @param workspaceId - Fabric workspace ID
 * @param accessToken - Bearer token for authentication
 * @param onProgress - Optional callback for progress updates
 * @returns Array of deployment results
 */
export async function deployFolders(
  folders: ADFFolderInfo[],
  workspaceId: string,
  accessToken: string,
  onProgress?: (current: number, total: number, folderPath: string) => void
): Promise<FolderDeploymentResult[]> {
  
  // Get folders in deployment order (depth-first)
  const orderedPaths = getFoldersInDeploymentOrder(folders);
  const results: FolderDeploymentResult[] = [];
  
  // Map to track path -> folderId for parent lookup
  const pathToIdMap = new Map<string, string>();
  
  // Map original paths to folder info
  const folderInfoMap = new Map<string, ADFFolderInfo>();
  for (const folder of folders) {
    folderInfoMap.set(folder.path, folder);
  }
  
  // Deploy each folder in order
  for (let i = 0; i < orderedPaths.length; i++) {
    const folderPath = orderedPaths[i];
    const folderInfo = folderInfoMap.get(folderPath);
    
    if (!folderInfo) {
      console.warn(`Folder info not found for path: ${folderPath}`);
      continue;
    }
    
    // Notify progress
    if (onProgress) {
      onProgress(i + 1, orderedPaths.length, folderPath);
    }
    
    const result: FolderDeploymentResult = {
      path: folderPath,
      displayName: folderInfo.name,
      status: 'skipped',
      timestamp: new Date().toISOString(),
      wasFlattened: folderInfo.isFlattened,
      originalPath: folderInfo.originalPath,
      depth: folderInfo.depth
    };
    
    try {
      // Determine parent folder ID
      const parentFolderId = folderInfo.parentPath 
        ? pathToIdMap.get(folderInfo.parentPath) 
        : undefined;
      
      // Create the folder
      const fabricFolder = await createFolder(
        workspaceId,
        folderInfo.name,
        parentFolderId,
        accessToken
      );
      
      // Store the folder ID for child folders
      if (fabricFolder.id) {
        pathToIdMap.set(folderPath, fabricFolder.id);
      }
      
      result.status = 'success';
      result.folderId = fabricFolder.id;
      
      console.log(`✅ Created folder: ${folderPath} (ID: ${fabricFolder.id})`);
      
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message || 'Unknown error';
      
      console.error(`❌ Failed to create folder: ${folderPath}`, error);
    }
    
    results.push(result);
  }
  
  return results;
}

/**
 * Build folder mappings from deployment results
 * Maps original ADF folder paths to Fabric folder IDs
 * 
 * @param results - Array of folder deployment results
 * @returns Record of original path -> folder ID
 */
export function buildFolderMappings(results: FolderDeploymentResult[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  
  for (const result of results) {
    if (result.status === 'success' && result.folderId) {
      // Map both the current path and original path (if different)
      mappings[result.path] = result.folderId;
      
      if (result.originalPath && result.originalPath !== result.path) {
        mappings[result.originalPath] = result.folderId;
      }
    }
  }
  
  return mappings;
}

/**
 * Get folder ID for a component based on its folder path
 * 
 * @param componentFolderPath - Folder path from ADF component
 * @param folderMappings - Map of folder paths to Fabric folder IDs
 * @returns Fabric folder ID or undefined if not found
 */
export function getFolderIdForComponent(
  componentFolderPath: string | undefined,
  folderMappings: Record<string, string>
): string | undefined {
  if (!componentFolderPath) {
    return undefined;
  }
  
  return folderMappings[componentFolderPath];
}

/**
 * Generate deployment summary report
 * 
 * @param results - Array of folder deployment results
 * @returns Human-readable summary string
 */
export function generateDeploymentSummary(results: FolderDeploymentResult[]): string {
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const flattened = results.filter(r => r.wasFlattened).length;
  
  let summary = '=== Folder Deployment Summary ===\n\n';
  summary += `Total Folders: ${results.length}\n`;
  summary += `✅ Successful: ${successful}\n`;
  summary += `❌ Failed: ${failed}\n`;
  summary += `⏭️  Skipped: ${skipped}\n`;
  summary += `🔄 Flattened: ${flattened}\n\n`;
  
  if (failed > 0) {
    summary += 'Failed Folders:\n';
    for (const result of results.filter(r => r.status === 'failed')) {
      summary += `  - ${result.path}: ${result.error}\n`;
    }
  }
  
  if (flattened > 0) {
    summary += '\nFlattened Folders:\n';
    for (const result of results.filter(r => r.wasFlattened)) {
      summary += `  - ${result.originalPath}\n`;
      summary += `    → ${result.path}\n`;
    }
  }
  
  return summary;
}

/**
 * Validate that all required folders were created successfully
 * 
 * @param results - Array of folder deployment results
 * @returns True if all folders were created successfully
 */
export function validateDeployment(results: FolderDeploymentResult[]): boolean {
  return results.every(r => r.status === 'success');
}

/**
 * Get folder statistics from deployment results
 * 
 * @param results - Array of folder deployment results
 * @returns Statistics object
 */
export function getDeploymentStatistics(results: FolderDeploymentResult[]) {
  const depths = results.map(r => r.depth || 0);
  
  return {
    totalFolders: results.length,
    successfulDeployments: results.filter(r => r.status === 'success').length,
    failedDeployments: results.filter(r => r.status === 'failed').length,
    skippedDeployments: results.filter(r => r.status === 'skipped').length,
    flattenedFolders: results.filter(r => r.wasFlattened).length,
    maxDepth: Math.max(0, ...depths),
    averageDepth: depths.reduce((sum, d) => sum + d, 0) / depths.length || 0,
    successRate: results.length > 0 
      ? (results.filter(r => r.status === 'success').length / results.length * 100).toFixed(2) + '%'
      : '0%'
  };
}
