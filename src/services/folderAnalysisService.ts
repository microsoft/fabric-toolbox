/**
 * Folder Analysis Service
 * 
 * Handles extraction, validation, and analysis of folder structures from ADF/Synapse ARM templates.
 * Supports automatic flattening for folders exceeding Fabric's 10-level depth limit.
 */

import {
  ADFComponent,
  ADFFolderInfo,
  FolderTreeNode,
  FolderDepthValidation,
  FolderFlatteningOptions
} from '../types';

/** Maximum folder depth allowed in Microsoft Fabric */
export const MAX_FABRIC_FOLDER_DEPTH = 10;

/**
 * Extract folder information from a single pipeline component
 * 
 * @param component - ADF component (pipeline)
 * @returns Folder information or null if no folder
 */
export function extractFolderFromPipeline(component: ADFComponent): ADFFolderInfo | null {
  try {
    // Check if component has a folder property in its definition
    const folderName = component.definition?.properties?.folder?.name || component.folder?.path;
    
    if (!folderName || typeof folderName !== 'string') {
      return null;
    }

    // Parse the folder path (e.g., "Folder002/SubFolder001")
    const pathSegments = folderName.split('/').filter(segment => segment.trim() !== '');
    
    if (pathSegments.length === 0) {
      return null;
    }

    // Get the folder name (last segment)
    const name = pathSegments[pathSegments.length - 1];
    
    // Get parent path (all segments except last)
    const parentPath = pathSegments.length > 1 
      ? pathSegments.slice(0, -1).join('/') 
      : undefined;

    return {
      path: folderName,
      name,
      parentPath,
      depth: pathSegments.length,
      segments: pathSegments,
      originalPath: folderName
    };
  } catch (error) {
    console.error(`Error extracting folder from component ${component.name}:`, error);
    return null;
  }
}

/**
 * Extract all unique folders from a collection of ADF components
 * 
 * @param components - Array of ADF components
 * @returns Array of unique folder information objects
 */
export function extractAllFolders(components: ADFComponent[]): ADFFolderInfo[] {
  const folderMap = new Map<string, ADFFolderInfo>();

  for (const component of components) {
    const folderInfo = extractFolderFromPipeline(component);
    
    if (folderInfo && !folderMap.has(folderInfo.path)) {
      folderMap.set(folderInfo.path, folderInfo);
    }
  }

  return Array.from(folderMap.values());
}

/**
 * Validate folder depth and identify folders exceeding the limit
 * 
 * @param folders - Array of folder information objects
 * @param maxDepth - Maximum allowed depth (default: 10 for Fabric)
 * @returns Validation result with folders categorized by depth status
 */
export function validateFolderDepth(
  folders: ADFFolderInfo[],
  maxDepth: number = MAX_FABRIC_FOLDER_DEPTH
): FolderDepthValidation {
  const validFolders: ADFFolderInfo[] = [];
  const invalidFolders: ADFFolderInfo[] = [];
  const requiresFlattening: ADFFolderInfo[] = [];

  for (const folder of folders) {
    if (folder.depth <= maxDepth) {
      validFolders.push(folder);
    } else {
      invalidFolders.push(folder);
      requiresFlattening.push(folder);
    }
  }

  return {
    isValid: invalidFolders.length === 0,
    maxDepth,
    validFolders,
    invalidFolders,
    requiresFlattening,
    summary: {
      totalFolders: folders.length,
      validCount: validFolders.length,
      invalidCount: invalidFolders.length,
      maxDepthFound: Math.max(0, ...folders.map(f => f.depth))
    }
  };
}

/**
 * Generate a flattened folder path for folders exceeding depth limit
 * 
 * Strategy: Keep first (maxDepth - 1) levels intact, then combine remaining levels with underscores
 * Example: "L1/L2/.../L9/L10/L11/L12" -> "L1/L2/.../L8/L9_L10_L11_L12"
 * 
 * @param folderInfo - Original folder information
 * @param options - Flattening options
 * @returns Flattened folder information
 */
export function generateFlattenedPath(
  folderInfo: ADFFolderInfo,
  options: FolderFlatteningOptions = {}
): ADFFolderInfo {
  const {
    maxDepth = MAX_FABRIC_FOLDER_DEPTH,
    separator = '_',
    preserveDepth = maxDepth - 1
  } = options;

  // If folder is already within limit, return as-is
  if (folderInfo.depth <= maxDepth) {
    return folderInfo;
  }

  const segments = folderInfo.segments;
  
  // Keep first (preserveDepth) segments intact
  const preservedSegments = segments.slice(0, preserveDepth);
  
  // Combine remaining segments with separator
  const remainingSegments = segments.slice(preserveDepth);
  const flattenedSegment = remainingSegments.join(separator);
  
  // Create final flattened path
  const flattenedSegments = [...preservedSegments, flattenedSegment];
  const flattenedPath = flattenedSegments.join('/');
  
  // Get the folder name (last segment)
  const name = flattenedSegments[flattenedSegments.length - 1];
  
  // Get parent path (all segments except last)
  const parentPath = flattenedSegments.length > 1 
    ? flattenedSegments.slice(0, -1).join('/') 
    : undefined;

  return {
    path: flattenedPath,
    name,
    parentPath,
    depth: flattenedSegments.length,
    segments: flattenedSegments,
    originalPath: folderInfo.originalPath,
    isFlattened: true,
    flatteningApplied: {
      originalDepth: folderInfo.depth,
      newDepth: flattenedSegments.length,
      strategy: 'underscore_combination'
    }
  };
}

/**
 * Build a hierarchical tree structure from flat folder paths
 * 
 * @param folders - Array of folder information objects
 * @returns Array of root-level folder tree nodes
 */
export function buildFolderTree(folders: ADFFolderInfo[]): FolderTreeNode[] {
  const nodeMap = new Map<string, FolderTreeNode>();
  const rootNodes: FolderTreeNode[] = [];

  // First pass: Create all nodes
  for (const folder of folders) {
    for (let i = 0; i < folder.segments.length; i++) {
      const pathSegments = folder.segments.slice(0, i + 1);
      const path = pathSegments.join('/');
      
      if (!nodeMap.has(path)) {
        const node: FolderTreeNode = {
          name: pathSegments[pathSegments.length - 1],
          path,
          depth: pathSegments.length,
          children: [],
          originalPath: folder.originalPath,
          isFlattened: folder.isFlattened
        };
        nodeMap.set(path, node);
      }
    }
  }

  // Second pass: Build hierarchy
  for (const [path, node] of nodeMap.entries()) {
    const segments = path.split('/');
    
    if (segments.length === 1) {
      // Root level node
      rootNodes.push(node);
    } else {
      // Child node - find parent
      const parentPath = segments.slice(0, -1).join('/');
      const parent = nodeMap.get(parentPath);
      
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  return rootNodes;
}

/**
 * Get all folder paths in deployment order (depth-first)
 * 
 * @param folders - Array of folder information objects
 * @returns Array of folder paths ordered for deployment
 */
export function getFoldersInDeploymentOrder(folders: ADFFolderInfo[]): string[] {
  const tree = buildFolderTree(folders);
  const orderedPaths: string[] = [];

  function traverse(node: FolderTreeNode) {
    orderedPaths.push(node.path);
    
    // Sort children alphabetically for consistent ordering
    const sortedChildren = [...node.children].sort((a, b) => a.name.localeCompare(b.name));
    
    for (const child of sortedChildren) {
      traverse(child);
    }
  }

  // Sort root nodes alphabetically
  const sortedRoots = [...tree].sort((a, b) => a.name.localeCompare(b.name));
  
  for (const root of sortedRoots) {
    traverse(root);
  }

  return orderedPaths;
}

/**
 * Apply folder flattening to all folders requiring it
 * 
 * @param folders - Array of folder information objects
 * @param options - Flattening options
 * @returns Array of folders with flattening applied where needed
 */
export function applyFolderFlattening(
  folders: ADFFolderInfo[],
  options: FolderFlatteningOptions = {}
): ADFFolderInfo[] {
  const validation = validateFolderDepth(folders, options.maxDepth);
  
  if (validation.isValid) {
    return folders; // No flattening needed
  }

  return folders.map(folder => {
    if (validation.requiresFlattening.some(f => f.path === folder.path)) {
      return generateFlattenedPath(folder, options);
    }
    return folder;
  });
}

/**
 * Get statistics about folder structure
 * 
 * @param folders - Array of folder information objects
 * @returns Statistics object
 */
export function getFolderStatistics(folders: ADFFolderInfo[]) {
  const depths = folders.map(f => f.depth);
  const validation = validateFolderDepth(folders);
  
  return {
    totalFolders: folders.length,
    uniquePaths: new Set(folders.map(f => f.path)).size,
    maxDepth: Math.max(0, ...depths),
    minDepth: Math.min(Infinity, ...depths),
    averageDepth: depths.reduce((sum, d) => sum + d, 0) / depths.length || 0,
    requiresFlattening: validation.requiresFlattening.length,
    rootFolders: folders.filter(f => f.depth === 1).length,
    flattenedFolders: folders.filter(f => f.isFlattened).length
  };
}

/**
 * Map components to their flattened folder paths
 * 
 * @param components - Array of ADF components
 * @param flattenedFolders - Array of flattened folder information
 * @returns Map of component name to flattened folder path
 */
export function mapComponentsToFlattenedFolders(
  components: ADFComponent[],
  flattenedFolders: ADFFolderInfo[]
): Map<string, string> {
  const folderMap = new Map<string, string>();
  
  // Create a lookup map from original path to flattened path
  const pathMap = new Map<string, string>();
  for (const folder of flattenedFolders) {
    pathMap.set(folder.originalPath, folder.path);
  }

  // Map each component to its flattened folder path
  for (const component of components) {
    const folderInfo = extractFolderFromPipeline(component);
    
    if (folderInfo) {
      const flattenedPath = pathMap.get(folderInfo.originalPath) || folderInfo.path;
      folderMap.set(component.name, flattenedPath);
    }
  }

  return folderMap;
}

/**
 * Generate a summary report of folder analysis
 * 
 * @param components - Array of ADF components
 * @returns Human-readable summary string
 */
export function generateFolderAnalysisReport(components: ADFComponent[]): string {
  const folders = extractAllFolders(components);
  const validation = validateFolderDepth(folders);
  const stats = getFolderStatistics(folders);
  const flattenedFolders = applyFolderFlattening(folders);

  let report = '=== Folder Structure Analysis ===\n\n';
  report += `Total Components: ${components.length}\n`;
  report += `Total Folders: ${stats.totalFolders}\n`;
  report += `Unique Folder Paths: ${stats.uniquePaths}\n`;
  report += `Max Depth: ${stats.maxDepth}\n`;
  report += `Average Depth: ${stats.averageDepth.toFixed(2)}\n\n`;

  if (validation.requiresFlattening.length > 0) {
    report += `⚠️  Folders Requiring Flattening: ${validation.requiresFlattening.length}\n\n`;
    report += 'Folders exceeding 10-level limit:\n';
    
    for (const folder of validation.requiresFlattening) {
      const flattened = flattenedFolders.find(f => f.originalPath === folder.originalPath);
      report += `  - ${folder.path} (depth: ${folder.depth})\n`;
      if (flattened) {
        report += `    → ${flattened.path} (depth: ${flattened.depth})\n`;
      }
    }
  } else {
    report += '✅ All folders are within Fabric\'s 10-level depth limit.\n';
  }

  return report;
}
