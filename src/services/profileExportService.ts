/**
 * Profile Export Service
 * 
 * Handles exporting ADF ARM Template profiles to Markdown format
 * with embedded Mermaid diagrams for dependency visualization.
 */

import { ADFProfile } from '../types/profiling';

/**
 * Export ADF profile to Markdown format with Mermaid diagrams
 * @param profile The ADF profile to export
 * @returns Markdown-formatted string
 */
export function exportProfileToMarkdown(profile: ADFProfile): string {
  const sections: string[] = [];

  // Header
  sections.push(`# ADF ARM Template Profile Report`);
  sections.push(`\nGenerated: ${profile.metadata.parsedAt.toLocaleString()}`);
  sections.push(`\nFile: ${profile.metadata.fileName}`);
  sections.push(`Size: ${(profile.metadata.fileSize / 1024).toFixed(2)} KB\n`);
  sections.push(`---\n`);

  // Summary Metrics
  sections.push(`## 📊 Summary Metrics\n`);
  sections.push(`| Metric | Count | Fabric Target |`);
  sections.push(`|--------|------:|---------------|`);
  sections.push(`| Pipelines | ${profile.metrics.totalPipelines} | Data Pipelines |`);
  sections.push(`| Datasets | ${profile.metrics.totalDatasets} | Embedded in Activities |`);
  sections.push(`| Linked Services | ${profile.metrics.totalLinkedServices} | Connections & Gateways |`);
  sections.push(`| Triggers | ${profile.metrics.totalTriggers} | Pipeline Schedules |`);
  sections.push(`| Total Activities | ${profile.metrics.totalActivities} | Activity Tasks |`);
  sections.push(`| Avg Activities/Pipeline | ${profile.metrics.avgActivitiesPerPipeline.toFixed(2)} | - |`);
  
  if (profile.metrics.totalDataflows > 0) {
    sections.push(`| Dataflows | ${profile.metrics.totalDataflows} | Dataflow Gen2 (Manual) |`);
  }
  sections.push(``);

  // Activity Breakdown
  if (Object.keys(profile.metrics.activitiesByType).length > 0) {
    sections.push(`## 🔧 Activity Type Distribution\n`);
    sections.push(`| Activity Type | Count | Percentage |`);
    sections.push(`|--------------|------:|-----------:|`);
    Object.entries(profile.metrics.activitiesByType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        const percentage = ((count / profile.metrics.totalActivities) * 100).toFixed(1);
        sections.push(`| ${type} | ${count} | ${percentage}% |`);
      });
    sections.push(``);
  }

  // Insights
  if (profile.insights.length > 0) {
    sections.push(`\n## 💡 Key Insights\n`);
    profile.insights.forEach((insight, idx) => {
      const severityEmoji = insight.severity === 'critical' ? '🔴' : insight.severity === 'warning' ? '⚠️' : 'ℹ️';
      sections.push(`### ${idx + 1}. ${severityEmoji} ${insight.title}\n`);
      sections.push(`${insight.description}\n`);
      if (insight.recommendation) {
        sections.push(`**💡 Recommendation:** ${insight.recommendation}\n`);
      }
    });
  }

  // Pipelines Table
  if (profile.artifacts.pipelines.length > 0) {
    sections.push(`\n## 🔄 Pipelines (${profile.artifacts.pipelines.length})\n`);
    sections.push(`| Pipeline Name | Activities | Triggered By | Uses Datasets | Fabric Status |`);
    sections.push(`|--------------|----------:|--------------|---------------|---------------|`);
    profile.artifacts.pipelines.forEach(p => {
      const status = p.fabricMapping?.compatibilityStatus || 'unknown';
      const triggers = p.triggeredBy.length > 0 ? p.triggeredBy.join(', ') : 'None';
      sections.push(`| ${p.name} | ${p.activityCount} | ${triggers} | ${p.usesDatasets.length} | ${status} |`);
    });
    sections.push(``);
  }

  // Datasets Table
  if (profile.artifacts.datasets.length > 0) {
    sections.push(`\n## 📊 Datasets (${profile.artifacts.datasets.length})\n`);
    sections.push(`| Dataset Name | Type | Linked Service | Used By Pipelines |`);
    sections.push(`|-------------|------|----------------|------------------:|`);
    profile.artifacts.datasets.forEach(d => {
      sections.push(`| ${d.name} | ${d.type} | ${d.linkedService} | ${d.usageCount} |`);
    });
    sections.push(``);
  }

  // Linked Services Table
  if (profile.artifacts.linkedServices.length > 0) {
    sections.push(`\n## 🔌 Linked Services (${profile.artifacts.linkedServices.length})\n`);
    sections.push(`| Linked Service Name | Type | Used By Datasets | Usage Score | Requires Gateway |`);
    sections.push(`|--------------------|------|----------------:|-----------:|:----------------:|`);
    profile.artifacts.linkedServices.forEach(ls => {
      const requiresGateway = ls.fabricMapping?.requiresGateway ? '✓' : '';
      sections.push(`| ${ls.name} | ${ls.type} | ${ls.usedByDatasets.length} | ${ls.usageScore} | ${requiresGateway} |`);
    });
    sections.push(``);
  }

  // Triggers Table
  if (profile.artifacts.triggers.length > 0) {
    sections.push(`\n## ⏰ Triggers (${profile.artifacts.triggers.length})\n`);
    sections.push(`| Trigger Name | Type | Status | Target Pipelines | Fabric Support |`);
    sections.push(`|-------------|------|--------|-----------------|----------------|`);
    profile.artifacts.triggers.forEach(t => {
      const supportLevel = t.fabricMapping?.supportLevel || 'unknown';
      sections.push(`| ${t.name} | ${t.type} | ${t.status} | ${t.pipelines.join(', ')} | ${supportLevel} |`);
    });
    sections.push(``);
  }

  // Dataflows Table
  if (profile.artifacts.dataflows.length > 0) {
    sections.push(`\n## 🌊 Dataflows (${profile.artifacts.dataflows.length})\n`);
    sections.push(`| Dataflow Name | Sources | Sinks | Transformations | Migration Path |`);
    sections.push(`|--------------|--------:|------:|----------------:|----------------|`);
    profile.artifacts.dataflows.forEach(df => {
      const migrationPath = df.fabricMapping?.targetType || 'Manual';
      sections.push(`| ${df.name} | ${df.sourceCount} | ${df.sinkCount} | ${df.transformationCount} | ${migrationPath} |`);
    });
    sections.push(``);
  }

  // Migration Complexity Summary
  sections.push(`\n## 📈 Migration Complexity Summary\n`);
  const complexPipelines = profile.artifacts.pipelines.filter(p => p.activityCount > 10).length;
  const highUsageDatasets = profile.artifacts.datasets.filter(d => d.usageCount > 5).length;
  const criticalConnections = profile.artifacts.linkedServices.filter(ls => ls.usageScore > 10).length;
  
  sections.push(`- **Complex Pipelines** (>10 activities): ${complexPipelines}`);
  sections.push(`- **High-Usage Datasets** (used by >5 pipelines): ${highUsageDatasets}`);
  sections.push(`- **Critical Connections** (usage score >10): ${criticalConnections}`);
  sections.push(`- **Pipeline Dependencies**: ${profile.metrics.pipelineDependencies}`);
  sections.push(`- **Trigger Mappings**: ${profile.metrics.triggerPipelineMappings}\n`);

  // Mermaid Diagrams - Multiple views for large graphs
  sections.push(`\n## 🗺️ Dependency Visualizations\n`);
  
  // Add dependency statistics first
  sections.push(`### 📊 Dependency Statistics\n`);
  sections.push(`| Metric | Count |`);
  sections.push(`|--------|------:|`);
  sections.push(`| Total Nodes | ${profile.dependencies.nodes.length} |`);
  sections.push(`| Total Dependencies | ${profile.dependencies.edges.length} |`);
  sections.push(`| Triggers | ${profile.dependencies.nodes.filter(n => n.type === 'trigger').length} |`);
  sections.push(`| Pipelines | ${profile.dependencies.nodes.filter(n => n.type === 'pipeline').length} |`);
  sections.push(`| Datasets | ${profile.dependencies.nodes.filter(n => n.type === 'dataset').length} |`);
  sections.push(`| Linked Services | ${profile.dependencies.nodes.filter(n => n.type === 'linkedService').length} |`);
  sections.push(`| Dataflows | ${profile.dependencies.nodes.filter(n => n.type === 'dataflow').length} |\n`);
  
  // Diagram 1: High-Level Architecture (Top nodes by connections)
  sections.push(`### 🏗️ Architecture Overview (Top 50 Components)\n`);
  sections.push(`This diagram shows the most connected components in your data factory.\n`);
  sections.push(`\`\`\`mermaid`);
  sections.push(`flowchart TB`);
  
  // Calculate node importance (number of connections)
  const nodeConnections = new Map<string, number>();
  profile.dependencies.nodes.forEach(node => {
    const connections = profile.dependencies.edges.filter(e => e.source === node.id || e.target === node.id).length;
    nodeConnections.set(node.id, connections);
  });
  
  // Get top 50 most connected nodes
  const topNodes = profile.dependencies.nodes
    .sort((a, b) => (nodeConnections.get(b.id) || 0) - (nodeConnections.get(a.id) || 0))
    .slice(0, 50);
  
  const maxNodesToShow = 50;
  const nodesToShow = topNodes;
  
  nodesToShow.forEach(node => {
    const nodeId = sanitizeNodeId(node.id);
    const nodeLabel = node.label.length > 20 ? node.label.substring(0, 17) + '...' : node.label;
    
    let nodeStyle = '';
    switch (node.type) {
      case 'trigger':
        nodeStyle = `([${nodeLabel}]):::triggerClass`;
        break;
      case 'pipeline':
        nodeStyle = `[${nodeLabel}]:::pipelineClass`;
        break;
      case 'dataset':
        nodeStyle = `[(${nodeLabel})]:::datasetClass`;
        break;
      case 'linkedService':
        nodeStyle = `{{${nodeLabel}}}:::linkedServiceClass`;
        break;
      case 'dataflow':
        nodeStyle = `[/${nodeLabel}/]:::dataflowClass`;
        break;
      default:
        nodeStyle = `[${nodeLabel}]`;
    }
    
    sections.push(`    ${nodeId}${nodeStyle}`);
  });
  
  // Add edges - limit to prevent diagram from being too large
  const edgesToShow = profile.dependencies.edges.slice(0, maxNodesToShow);
  edgesToShow.forEach(edge => {
    const sourceId = sanitizeNodeId(edge.source);
    const targetId = sanitizeNodeId(edge.target);
    
    // Only add edge if both nodes are in the limited set
    if (nodesToShow.some(n => n.id === edge.source) && nodesToShow.some(n => n.id === edge.target)) {
      const edgeLabel = edge.label ? `|${edge.label}|` : '';
      const arrowType = edge.type === 'triggers' ? '==>' : '-->';
      sections.push(`    ${sourceId} ${arrowType}${edgeLabel} ${targetId}`);
    }
  });
  
  // Add class definitions for styling
  sections.push(``);
  sections.push(`    classDef triggerClass fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff`);
  sections.push(`    classDef pipelineClass fill:#464feb,stroke:#3730a3,stroke-width:2px,color:#fff`);
  sections.push(`    classDef datasetClass fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff`);
  sections.push(`    classDef linkedServiceClass fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#000`);
  sections.push(`    classDef dataflowClass fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#fff`);
  sections.push(`\`\`\``);

  if (profile.dependencies.nodes.length > maxNodesToShow) {
    sections.push(`\n*Note: Showing top ${maxNodesToShow} most connected components. Total nodes: ${profile.dependencies.nodes.length}*\n`);
  }

  // Diagram 2: Critical Path (Triggers to Pipelines)
  const triggerNodes = profile.dependencies.nodes.filter(n => n.type === 'trigger').slice(0, 25);
  const pipelineNodes = profile.dependencies.nodes.filter(n => n.type === 'pipeline').slice(0, 25);
  
  if (triggerNodes.length > 0 && pipelineNodes.length > 0) {
    sections.push(`\n### 🎯 Critical Path: Triggers → Pipelines (Top 25 Each)\n`);
    sections.push(`This diagram shows how triggers activate pipelines.\n`);
    sections.push(`\`\`\`mermaid`);
    sections.push(`flowchart LR`);
    
    // Add trigger nodes
    triggerNodes.forEach(node => {
      const nodeId = sanitizeNodeId(node.id);
      const nodeLabel = node.label.length > 20 ? node.label.substring(0, 17) + '...' : node.label;
      sections.push(`    ${nodeId}([${nodeLabel}]):::triggerClass`);
    });
    
    // Add pipeline nodes
    pipelineNodes.forEach(node => {
      const nodeId = sanitizeNodeId(node.id);
      const nodeLabel = node.label.length > 20 ? node.label.substring(0, 17) + '...' : node.label;
      sections.push(`    ${nodeId}[${nodeLabel}]:::pipelineClass`);
    });
    
    // Add edges between triggers and pipelines
    const criticalPathNodes = [...triggerNodes.map(n => n.id), ...pipelineNodes.map(n => n.id)];
    profile.dependencies.edges.forEach(edge => {
      if (criticalPathNodes.includes(edge.source) && criticalPathNodes.includes(edge.target)) {
        const sourceId = sanitizeNodeId(edge.source);
        const targetId = sanitizeNodeId(edge.target);
        const edgeLabel = edge.label ? `|${edge.label}|` : '';
        const arrowType = edge.type === 'triggers' ? '==>' : '-->';
        sections.push(`    ${sourceId} ${arrowType}${edgeLabel} ${targetId}`);
      }
    });
    
    sections.push(``);
    sections.push(`    classDef triggerClass fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff`);
    sections.push(`    classDef pipelineClass fill:#464feb,stroke:#3730a3,stroke-width:2px,color:#fff`);
    sections.push(`\`\`\``);
    sections.push(``);
  }

  // Diagram 3: Data Flow (Pipelines → Datasets → Linked Services)
  const topPipelines = profile.dependencies.nodes.filter(n => n.type === 'pipeline').slice(0, 20);
  const topDatasets = profile.dependencies.nodes.filter(n => n.type === 'dataset')
    .sort((a, b) => {
      const aUsage = profile.dependencies.edges.filter(e => e.target === a.id).length;
      const bUsage = profile.dependencies.edges.filter(e => e.target === b.id).length;
      return bUsage - aUsage;
    })
    .slice(0, 20);
  const topLinkedServices = profile.dependencies.nodes.filter(n => n.type === 'linkedService')
    .sort((a, b) => {
      const aUsage = profile.dependencies.edges.filter(e => e.target === a.id).length;
      const bUsage = profile.dependencies.edges.filter(e => e.target === b.id).length;
      return bUsage - aUsage;
    })
    .slice(0, 10);
  
  if (topDatasets.length > 0) {
    sections.push(`\n### 💾 Data Flow: Pipelines → Datasets → Connections (Top Components)\n`);
    sections.push(`This diagram shows data flow from pipelines through datasets to data sources.\n`);
    sections.push(`\`\`\`mermaid`);
    sections.push(`flowchart LR`);
    
    // Add nodes
    topPipelines.forEach(node => {
      const nodeId = sanitizeNodeId(node.id);
      const nodeLabel = node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label;
      sections.push(`    ${nodeId}[${nodeLabel}]:::pipelineClass`);
    });
    
    topDatasets.forEach(node => {
      const nodeId = sanitizeNodeId(node.id);
      const nodeLabel = node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label;
      sections.push(`    ${nodeId}[(${nodeLabel})]:::datasetClass`);
    });
    
    topLinkedServices.forEach(node => {
      const nodeId = sanitizeNodeId(node.id);
      const nodeLabel = node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label;
      sections.push(`    ${nodeId}{{${nodeLabel}}}:::linkedServiceClass`);
    });
    
    // Add edges
    const dataFlowNodes = [
      ...topPipelines.map(n => n.id),
      ...topDatasets.map(n => n.id),
      ...topLinkedServices.map(n => n.id)
    ];
    profile.dependencies.edges.forEach(edge => {
      if (dataFlowNodes.includes(edge.source) && dataFlowNodes.includes(edge.target)) {
        const sourceId = sanitizeNodeId(edge.source);
        const targetId = sanitizeNodeId(edge.target);
        sections.push(`    ${sourceId} --> ${targetId}`);
      }
    });
    
    sections.push(``);
    sections.push(`    classDef pipelineClass fill:#464feb,stroke:#3730a3,stroke-width:2px,color:#fff`);
    sections.push(`    classDef datasetClass fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff`);
    sections.push(`    classDef linkedServiceClass fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#000`);
    sections.push(`\`\`\``);
    sections.push(``);
  }

  // Interactive HTML Export Note
  if (profile.dependencies.nodes.length > 100) {
    sections.push(`\n### 💡 Full Graph Visualization\n`);
    sections.push(`Due to the large number of components (${profile.dependencies.nodes.length} nodes), `);
    sections.push(`the full dependency graph is best viewed in the interactive UI.\n`);
    sections.push(`**To view all ${profile.dependencies.nodes.length} nodes:**`);
    sections.push(`1. Go to the **ADF Profiling** page in the tool`);
    sections.push(`2. Navigate to the **Dependency Graph** tab`);
    sections.push(`3. Use the fullscreen mode (F key) for best viewing experience`);
    sections.push(`4. The canvas rendering mode provides smooth performance even with 2000+ nodes\n`);
  }

  // Fabric Migration Mapping Guide
  sections.push(`\n## 🎯 Fabric Migration Mapping\n`);
  sections.push(`### Component Type Mappings\n`);
  sections.push(`| ADF Component | Fabric Target | Notes |`);
  sections.push(`|---------------|---------------|-------|`);
  sections.push(`| Pipeline | Data Pipeline | Direct mapping, most activities supported |`);
  sections.push(`| Dataset | Embedded in Activity | Datasets become connection configurations within activities |`);
  sections.push(`| Linked Service | Connection/Gateway | Connections for cloud sources, Gateways for on-premises |`);
  sections.push(`| Schedule Trigger | Pipeline Schedule | Recreated as native pipeline schedules |`);
  sections.push(`| Event Trigger | Manual/Custom | May require custom implementation |`);
  sections.push(`| Mapping Dataflow | Dataflow Gen2 | Requires manual recreation |`);
  sections.push(`| Global Parameter | Variable Library | Workspace-level variables |`);
  sections.push(`| Integration Runtime | Gateway | Managed IR → VNet Gateway, Self-hosted IR → On-premises Gateway |\n`);

  // Footer
  sections.push(`\n---\n`);
  sections.push(`\n*Report generated by ADF to Fabric Migration Tool*`);
  sections.push(`\n*For more information, visit: https://learn.microsoft.com/fabric*\n`);

  return sections.join('\n');
}

/**
 * Sanitize node ID for Mermaid diagram compatibility
 * @param id Original node ID
 * @returns Sanitized ID safe for Mermaid
 */
function sanitizeNodeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Export profile as JSON
 * @param profile The ADF profile to export
 * @returns JSON string
 */
export function exportProfileToJson(profile: ADFProfile): string {
  return JSON.stringify(profile, null, 2);
}

/**
 * Export profile as CSV (summary metrics only)
 * @param profile The ADF profile to export
 * @returns CSV string
 */
export function exportProfileToCsv(profile: ADFProfile): string {
  const rows: string[] = [];
  
  // Header
  rows.push('Metric,Value');
  
  // Metrics
  rows.push(`File Name,${profile.metadata.fileName}`);
  rows.push(`File Size (KB),${(profile.metadata.fileSize / 1024).toFixed(2)}`);
  rows.push(`Total Pipelines,${profile.metrics.totalPipelines}`);
  rows.push(`Total Datasets,${profile.metrics.totalDatasets}`);
  rows.push(`Total Linked Services,${profile.metrics.totalLinkedServices}`);
  rows.push(`Total Triggers,${profile.metrics.totalTriggers}`);
  rows.push(`Total Activities,${profile.metrics.totalActivities}`);
  rows.push(`Avg Activities per Pipeline,${profile.metrics.avgActivitiesPerPipeline.toFixed(2)}`);
  rows.push(`Max Activities per Pipeline,${profile.metrics.maxActivitiesPerPipeline}`);
  rows.push(`Most Complex Pipeline,${profile.metrics.maxActivitiesPipelineName}`);
  
  return rows.join('\n');
}
