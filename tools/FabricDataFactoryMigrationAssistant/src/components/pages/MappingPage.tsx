import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, CaretDown, CaretRight, Gear, Info, CheckCircle, Warning, GitBranch } from '@phosphor-icons/react';
import { WizardLayout } from '../WizardLayout';
import { WorkspaceDisplay } from '../WorkspaceDisplay';
import { NavigationDebug } from '../NavigationDebug';
import { useAppContext } from '../../contexts/AppContext';
import { ActivityConnectionMapping, FabricTarget, PipelineConnectionMappings, CustomActivityMapping } from '../../types';
import { extractString } from '../../lib/validation';
import {
  PipelineActivityAnalysisService,
  ActivityLinkedServiceReference
} from '../../services/pipelineActivityAnalysisService';
import {
  ExistingConnectionsService,
  ExistingFabricConnection
} from '../../services/existingConnectionsService';
import { 
  LinkedServiceMappingBridgeService 
} from '../../services/linkedServiceMappingBridgeService';
import { customActivityMappingService } from '../../services/customActivityMappingService';
import { toast } from 'sonner';
import { ComponentMappingTable } from './mapping/ComponentMappingTable';
import { ComponentMappingTableV2 } from './mapping/ComponentMappingTableV2';
// import { PipelineMappingCard } from './mapping/PipelineMappingCard'; // DEPRECATED: Replaced by ComponentMappingTableV2
import { unifiedActivityMappingService } from '../../services/unifiedActivityMappingService';
import { PipelineMappingSummary } from '../../types';

const TARGET_TYPE_OPTIONS: Record<string, Array<{ value: FabricTarget['type']; label: string }>> = {
  pipeline: [{ value: 'dataPipeline', label: 'Data Pipeline' }],
  linkedService: [
    { value: 'connector', label: 'Connector' },
    { value: 'gateway', label: 'Data Gateway Connection' }
  ],
  globalParameter: [{ value: 'variable', label: 'Variable Library Entry' }],
  trigger: [{ value: 'schedule', label: 'Pipeline Schedule' }],
  integrationRuntime: [{ value: 'gateway', label: 'Fabric Gateway' }],
  customActivity: [
    { value: 'notebook', label: 'Fabric Notebook' },
    { value: 'dataPipeline', label: 'Data Pipeline Activity' }
  ]
};

const isWorkspaceIdentityCredential = (component: any): boolean => {
  if (!component) return false;
  if (
    component.definition?.resourceMetadata?.armResourceType ===
      'Microsoft.Synapse/workspaces/credentials' &&
    component.definition?.properties?.type === 'ManagedIdentity'
  ) {
    return true;
  }
  if (
    component.type === 'globalParameter' &&
    component.definition?.type === 'credential' &&
    component.definition?.properties?.type === 'ManagedIdentity'
  ) {
    return true;
  }
  return false;
};

const buildActivityUniqueId = (
  reference: ActivityLinkedServiceReference,
  index: number
): string => {
  const linkedServiceKey =
    reference.linkedServiceName || reference.datasetLinkedServiceName || 'Unknown';
  return `${reference.activityName}_${linkedServiceKey}_${index}`;
};

export function MappingPage() {
  const { state, dispatch } = useAppContext();
  const [expandedComponents, setExpandedComponents] = useState<Set<number>>(new Set());
  // const [expandedPipelines, setExpandedPipelines] = useState<Set<string>>(new Set()); // DEPRECATED: Table manages its own expansion
  const [existingConnections, setExistingConnections] = useState<ExistingFabricConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [pipelineConnectionMappings, setPipelineConnectionMappings] = useState<PipelineConnectionMappings>({});
  
  // NEW: ReferenceId-based mappings (fixes dropdown persistence bug)
  const [pipelineReferenceMappings, setPipelineReferenceMappings] = useState<Record<string, Record<string, string>>>({});
  
  const [autoSelectedMappings, setAutoSelectedMappings] = useState<string[]>([]);
  
  // NEW: Unified pipeline summaries (replaces customActivityMappings)
  const [pipelineSummaries, setPipelineSummaries] = useState<PipelineMappingSummary[]>([]);
  const [generatingSummaries, setGeneratingSummaries] = useState(false);

  useEffect(() => {
    if (state.pipelineConnectionMappings) {
      setPipelineConnectionMappings(state.pipelineConnectionMappings);
    }
  }, [state.pipelineConnectionMappings]);

  // Helper function to recursively extract all activities from nested structures
  const extractAllActivities = (activities: any[]): any[] => {
    const allActivities: any[] = [];
    
    const traverse = (activityList: any[]) => {
      if (!Array.isArray(activityList)) return;
      
      activityList.forEach((activity: any) => {
        // Add current activity
        allActivities.push(activity);
        
        // Recursively check for nested activities in different container types
        
        // ForEach activities
        if (activity.type === 'ForEach' && activity.typeProperties?.activities) {
          traverse(activity.typeProperties.activities);
        }
        
        // IfCondition activities
        if (activity.type === 'IfCondition') {
          if (activity.typeProperties?.ifTrueActivities) {
            traverse(activity.typeProperties.ifTrueActivities);
          }
          if (activity.typeProperties?.ifFalseActivities) {
            traverse(activity.typeProperties.ifFalseActivities);
          }
        }
        
        // Switch activities
        if (activity.type === 'Switch' && activity.typeProperties?.cases) {
          activity.typeProperties.cases.forEach((caseItem: any) => {
            if (caseItem.activities) {
              traverse(caseItem.activities);
            }
          });
          // Also check default activities
          if (activity.typeProperties.defaultActivities) {
            traverse(activity.typeProperties.defaultActivities);
          }
        }
        
        // Until activities
        if (activity.type === 'Until' && activity.typeProperties?.activities) {
          traverse(activity.typeProperties.activities);
        }
      });
    };
    
    traverse(activities);
    return allActivities;
  };

  // NEW: Generate unified pipeline summaries when components or mappings change
  useEffect(() => {
    if (!state.selectedComponents || state.selectedComponents.length === 0) {
      setPipelineSummaries([]);
      return;
    }

    const pipelines = state.selectedComponents.filter(c => c.type === 'pipeline');
    if (pipelines.length === 0) {
      setPipelineSummaries([]);
      return;
    }

    setGeneratingSummaries(true);
    
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      const datasets = state.adfComponents?.filter(c => c.type === 'dataset') || [];
      
      // Use the new referenceId-based mappings (fixes dropdown persistence)
      // Fall back to old format for backwards compatibility
      const existingMappingsFormatted: Record<string, Record<string, string>> = {};
      
      // Priority 1: Use new referenceId-based mappings
      Object.entries(pipelineReferenceMappings).forEach(([pipelineName, refMappings]) => {
        existingMappingsFormatted[pipelineName] = { ...refMappings };
      });
      
      // Priority 2: Merge in old activity-based mappings (backwards compatibility)
      Object.entries(pipelineConnectionMappings).forEach(([pipelineName, activities]) => {
        if (!existingMappingsFormatted[pipelineName]) {
          existingMappingsFormatted[pipelineName] = {};
        }
        Object.entries(activities).forEach(([activityName, mapping]: [string, any]) => {
          // Extract connection IDs from various mapping formats
          if (mapping.selectedConnectionId) {
            // Store by linkedServiceName as fallback (service will try referenceId first)
            if (mapping.linkedServiceReference?.name) {
              existingMappingsFormatted[pipelineName][mapping.linkedServiceReference.name] = mapping.selectedConnectionId;
            }
          }
          // Handle custom activity references
          if (mapping.customActivityReferences) {
            mapping.customActivityReferences.forEach((ref: any) => {
              if (ref.selectedConnectionId) {
                existingMappingsFormatted[pipelineName][ref.linkedServiceName] = ref.selectedConnectionId;
              }
            });
          }
        });
      });

      const summaries = pipelines.map(pipeline => {
        try {
          return unifiedActivityMappingService.createPipelineSummary(
            pipeline,
            datasets,
            existingMappingsFormatted
          );
        } catch (error) {
          console.error(`Error creating summary for pipeline ${pipeline.name}:`, error);
          // Return a minimal summary on error
          return {
            pipelineName: pipeline.name,
            folderPath: pipeline.folder?.path,
            totalActivities: 0,
            totalReferences: 0,
            mappedReferences: 0,
            mappingPercentage: 0,
            activityGroups: [],
            isFullyMapped: false,
            validationErrors: [`Error analyzing pipeline: ${error}`]
          } as PipelineMappingSummary;
        }
      });

      setPipelineSummaries(summaries);
      setGeneratingSummaries(false);
      console.log(`Generated ${summaries.length} pipeline summaries with unified activity mappings`);
    }, 0);
  }, [state.selectedComponents, state.adfComponents, pipelineConnectionMappings, pipelineReferenceMappings]);

  // NEW: Build LinkedService Connection Bridge
  useEffect(() => {
    if (state.connectionMappings?.linkedServices && state.connectionMappings.linkedServices.length > 0) {
      const bridge = LinkedServiceMappingBridgeService.buildBridge(state.connectionMappings);
      
      dispatch({
        type: 'BUILD_LINKEDSERVICE_CONNECTION_BRIDGE',
        payload: bridge
      });
      
      console.log('LinkedService Connection Bridge built:', bridge);
      console.log(`Bridge contains ${Object.keys(bridge).length} LinkedService mappings`);
    }
  }, [state.connectionMappings, dispatch]);

  // NEW: Auto-apply bridge mappings to pipeline activities
  useEffect(() => {
    // Skip if:
    // - No bridge exists
    // - No selected components
    // - Mappings already populated (manual mappings exist)
    // - Bridge is empty
    if (
      !state.linkedServiceConnectionBridge || 
      !state.selectedComponents ||
      Object.keys(state.linkedServiceConnectionBridge).length === 0
    ) {
      return;
    }

    // Check if we already have mappings - don't override manual work
    const existingMappingsCount = Object.keys(pipelineConnectionMappings).length;
    if (existingMappingsCount > 0) {
      console.log('Skipping bridge auto-apply: manual mappings already exist');
      return;
    }

    const autoMappings: PipelineConnectionMappings = {};
    let autoMappedCount = 0;
    let totalActivitiesNeedingMapping = 0;
    const autoMappingDetails: string[] = [];

    state.selectedComponents.forEach(component => {
      if (component?.type !== 'pipeline') return;

      const activityReferences = getPipelineActivityReferences(component);
      if (activityReferences.length === 0) return;

      totalActivitiesNeedingMapping += activityReferences.length;

      const appliedMappings = LinkedServiceMappingBridgeService.applyBridgeToPipeline(
        component.name,
        activityReferences,
        state.linkedServiceConnectionBridge
      );

      // Convert to pipeline connection mappings format
      const pipelineMappings: Record<string, ActivityConnectionMapping> = {};
      appliedMappings.forEach((mapping, index) => {
        const ref = activityReferences[index];
        const uniqueId = buildActivityUniqueId(ref, index);

        if (mapping.selectedConnectionId && 
            !mapping.selectedConnectionId.startsWith('pending-') &&
            !mapping.selectedConnectionId.startsWith('new-')) {
          pipelineMappings[uniqueId] = mapping;
          autoMappedCount++;
          
          const linkedServiceName = ref.linkedServiceName || ref.datasetLinkedServiceName || 'Unknown';
          const bridgeEntry = state.linkedServiceConnectionBridge[linkedServiceName];
          autoMappingDetails.push(
            `${component.name}.${ref.activityName} → ${bridgeEntry?.connectionDisplayName || mapping.selectedConnectionId}`
          );
        }
      });

      if (Object.keys(pipelineMappings).length > 0) {
        autoMappings[component.name] = pipelineMappings;
      }
    });

    if (Object.keys(autoMappings).length > 0) {
      setPipelineConnectionMappings(autoMappings);
      setAutoSelectedMappings(autoMappingDetails);
      
      dispatch({
        type: 'SET_PIPELINE_CONNECTION_MAPPINGS',
        payload: autoMappings
      });

      const coveragePercent = Math.round((autoMappedCount / totalActivitiesNeedingMapping) * 100);
      
      toast.success(
        `Auto-applied ${autoMappedCount} of ${totalActivitiesNeedingMapping} connection mappings (${coveragePercent}%) from Configure Connections`,
        { 
          duration: 6000,
          description: 'Review and adjust mappings as needed'
        }
      );
      
      console.log(`Auto-applied ${autoMappedCount}/${totalActivitiesNeedingMapping} mappings`);
      console.log('Auto-mapping details:', autoMappingDetails);
    } else if (totalActivitiesNeedingMapping > 0) {
      toast.info(
        `${totalActivitiesNeedingMapping} pipeline activities require connection mapping`,
        {
          description: 'No automatic mappings could be applied. Please configure connections manually.',
          duration: 5000
        }
      );
    }
  }, [state.linkedServiceConnectionBridge, state.selectedComponents, state.adfComponents, dispatch]);

  useEffect(() => {
    const loadConnections = async () => {
      if (!state.auth?.accessToken || !state.selectedWorkspace?.id) {
        setExistingConnections([]);
        return;
      }

      setLoadingConnections(true);
      try {
        const connections = await ExistingConnectionsService.getExistingConnections(
          state.auth.accessToken,
          state.selectedWorkspace.id
        );
        setExistingConnections(connections);
      } catch (error) {
        console.error('Failed to load existing Fabric connections', error);
        setExistingConnections([]);
      } finally {
        setLoadingConnections(false);
      }
    };

    loadConnections();
  }, [state.auth?.accessToken, state.selectedWorkspace?.id]);

  // FIXED: Use adfComponents as source instead of selectedComponents
  // This prevents components from disappearing when unchecked
  const filteredComponents = useMemo(() => {
    return (state.adfComponents || []).filter(
      component =>
        component &&
        component.type !== 'dataset' &&
        component.type !== 'linkedService' &&
        component.type !== 'managedIdentity' &&
        !isWorkspaceIdentityCredential(component)
    );
  }, [state.adfComponents]);

  const componentsByType = useMemo(() => {
    return filteredComponents.reduce(
      (acc, component, index) => {
        if (!component?.type) return acc;
        if (!acc[component.type]) {
          acc[component.type] = [];
        }
        acc[component.type].push({ ...component, mappingIndex: index });
        return acc;
      },
      {} as Record<string, Array<(typeof filteredComponents)[number] & { mappingIndex: number }>>
    );
  }, [filteredComponents]);

  // FIXED: Use filteredComponents (derived from adfComponents) instead of selectedComponents
  // This ensures consistent behavior - only selected components need targets for deployment
  const componentsNeedingTargets = useMemo(() => {
    return filteredComponents.filter(component => component?.isSelected);
  }, [filteredComponents]);

  const allComponentsHaveTargets = useMemo(() => {
    return componentsNeedingTargets.every(component => Boolean(component?.fabricTarget));
  }, [componentsNeedingTargets]);

  const componentsMissingTargets = useMemo(() => {
    return componentsNeedingTargets.filter(component => !component?.fabricTarget);
  }, [componentsNeedingTargets]);

  const getPipelineActivityReferences = (component: any) => {
    if (!component || component.type !== 'pipeline') return [];
    return PipelineActivityAnalysisService.analyzePipelineActivities(
      component,
      state.adfComponents
    );
  };

  const allRequiredMappings = useMemo(() => {
    const required: Array<{
      pipelineName: string;
      activityName: string;
      uniqueId: string;
      linkedServiceName: string;
    }> = [];

    (state.selectedComponents || []).forEach(component => {
      if (component?.type !== 'pipeline') return;
      const references = getPipelineActivityReferences(component);
      references.forEach((reference, index) => {
        const uniqueId = buildActivityUniqueId(reference, index);
        const linkedServiceName =
          reference.linkedServiceName || reference.datasetLinkedServiceName || 'Unknown';
        required.push({
          pipelineName: component.name,
          activityName: reference.activityName,
          uniqueId,
          linkedServiceName
        });
      });
    });

    return required;
  }, [state.selectedComponents, state.adfComponents]);

  const incompleteMappings = useMemo(() => {
    return allRequiredMappings.filter(required => {
      const selected = pipelineConnectionMappings[required.pipelineName]?.[required.uniqueId];
      return !selected?.selectedConnectionId;
    });
  }, [allRequiredMappings, pipelineConnectionMappings]);

  const allMappingsComplete = incompleteMappings.length === 0;

  useEffect(() => {
    if (!existingConnections.length || !(state.selectedComponents || []).length) {
      return;
    }

    const newMappings: PipelineConnectionMappings = { ...pipelineConnectionMappings };
    const autoSelections: string[] = [];
    let hasUpdates = false;

    (state.selectedComponents || []).forEach(component => {
      if (component?.type !== 'pipeline') return;

      const references = getPipelineActivityReferences(component);
      references.forEach((reference, index) => {
        const uniqueId = buildActivityUniqueId(reference, index);
        const currentMapping = newMappings[component.name]?.[uniqueId];
        if (currentMapping?.selectedConnectionId) return;

        let matchedConnection: ExistingFabricConnection | undefined;
        if (reference.referenceLocation === 'invokePipeline') {
          matchedConnection = existingConnections.find(
            connection => connection.connectionDetails.type === 'FabricDataPipelines'
          );
        } else {
          const linkedServiceName =
            reference.linkedServiceName || reference.datasetLinkedServiceName;
          matchedConnection = existingConnections.find(
            connection =>
              connection.displayName === linkedServiceName &&
              connection.connectionDetails.type !== 'FabricDataPipelines'
          );
        }

        if (!matchedConnection) return;

        if (!newMappings[component.name]) {
          newMappings[component.name] = {};
        }

        newMappings[component.name][uniqueId] = {
          activityName: reference.activityName,
          activityType: reference.activityType,
          linkedServiceReference: reference.linkedServiceName
            ? { name: reference.linkedServiceName, type: reference.linkedServiceType }
            : undefined,
          selectedConnectionId: matchedConnection.id
        };

        autoSelections.push(
          `${component.name}.${reference.activityName} → ${matchedConnection.displayName}`
        );
        hasUpdates = true;
      });
    });

    if (hasUpdates) {
      setPipelineConnectionMappings(newMappings);
      setAutoSelectedMappings(autoSelections);
      dispatch({ type: 'SET_PIPELINE_CONNECTION_MAPPINGS', payload: newMappings });
    }
  }, [existingConnections, state.selectedComponents, state.adfComponents]);

  const handleTargetTypeChange = (index: number, value: string) => {
    const component = filteredComponents[index];
    if (!component?.fabricTarget) return;

    const options = TARGET_TYPE_OPTIONS[component.type] || TARGET_TYPE_OPTIONS.pipeline;
    const allowedTypes = options.map(option => option.value);
    const targetType = allowedTypes.includes(value as FabricTarget['type'])
      ? (value as FabricTarget['type'])
      : component.fabricTarget.type;

    const updatedTarget: FabricTarget = { ...component.fabricTarget, type: targetType };
    const originalIndex = (state.adfComponents || []).findIndex(
      c => c && c.name === component.name && c.type === component.type
    );

    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_COMPONENT_TARGET',
        payload: { index: originalIndex, fabricTarget: updatedTarget }
      });
    }
  };

  const handleTargetNameChange = (index: number, value: string) => {
    const component = filteredComponents[index];
    if (!component?.fabricTarget) return;

    const sanitizedName = extractString(value).trim().slice(0, 255);
    const updatedTarget: FabricTarget = { ...component.fabricTarget, name: sanitizedName };
    const originalIndex = (state.adfComponents || []).findIndex(
      c => c && c.name === component.name && c.type === component.type
    );

    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_COMPONENT_TARGET',
        payload: { index: originalIndex, fabricTarget: updatedTarget }
      });
    }
  };

  const handleTargetConfigChange = (index: number, updatedTarget: FabricTarget) => {
    const component = filteredComponents[index];
    if (!component) return;

    const originalIndex = (state.adfComponents || []).findIndex(
      c => c && c.name === component.name && c.type === component.type
    );

    if (originalIndex >= 0) {
      dispatch({
        type: 'UPDATE_COMPONENT_TARGET',
        payload: { index: originalIndex, fabricTarget: updatedTarget }
      });
    }
  };

  const toggleComponentExpansion = (index: number) => {
    setExpandedComponents(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // OLD: Index-based toggle (deprecated, has filtering bug)
  const handleToggle = (index: number) => {
    const component = (state.adfComponents || [])[index];
    if (component) {
      dispatch({
        type: 'UPDATE_COMPONENT_SELECTION',
        payload: { index, isSelected: !component.isSelected }
      });
    }
  };

  // NEW: ID-based toggle (fixes filtering bug)
  const handleToggleById = (componentId: string) => {
    const index = (state.adfComponents || []).findIndex(c => c.name === componentId);
    if (index !== -1) {
      const component = state.adfComponents![index];
      dispatch({
        type: 'UPDATE_COMPONENT_SELECTION',
        payload: { index, isSelected: !component.isSelected }
      });
    }
  };

  const handleBulkToggle = (indices: number[], isSelected: boolean) => {
    dispatch({
      type: 'BULK_UPDATE_COMPONENT_SELECTION',
      payload: { indices, isSelected }
    });
  };

  // NEW: ID-based bulk toggle (fixes filtering bug)
  const handleBulkToggleById = (componentIds: string[], isSelected: boolean) => {
    const indices = componentIds
      .map(id => (state.adfComponents || []).findIndex(c => c.name === id))
      .filter(index => index !== -1);
    
    if (indices.length > 0) {
      dispatch({
        type: 'BULK_UPDATE_COMPONENT_SELECTION',
        payload: { indices, isSelected }
      });
    }
  };

  // NEW: Pipeline selection handlers
  const handlePipelineToggle = (pipelineName: string) => {
    handleToggleById(pipelineName);
  };

  const handleBulkPipelineToggle = (pipelineNames: string[], isSelected: boolean) => {
    handleBulkToggleById(pipelineNames, isSelected);
  };

  // DEPRECATED: togglePipelineExpansion - no longer needed, table manages its own expansion
  // const togglePipelineExpansion = (pipelineName: string) => {
  //   setExpandedPipelines(prev => {
  //     const next = new Set(prev);
  //     if (next.has(pipelineName)) {
  //       next.delete(pipelineName);
  //     } else {
  //       next.add(pipelineName);
  //     }
  //     return next;
  //   });
  // };

  const handleActivityConnectionMapping = (
    pipelineName: string,
    uniqueId: string,
    selectedConnectionId: string,
    activity: ActivityConnectionMapping
  ) => {
    const updatedMapping: ActivityConnectionMapping = {
      ...activity,
      selectedConnectionId
    };

    setPipelineConnectionMappings(prev => {
      const pipelineMappings = prev[pipelineName] || {};
      return {
        ...prev,
        [pipelineName]: {
          ...pipelineMappings,
          [uniqueId]: updatedMapping
        }
      };
    });

    dispatch({
      type: 'UPDATE_PIPELINE_CONNECTION_MAPPING',
      payload: {
        pipelineName,
        activityName: uniqueId,
        mapping: updatedMapping
      }
    });
  };

  // NEW: Handle unified activity mapping changes (replaces handleCustomActivityMappingChange)
  const handleUnifiedActivityMappingChange = (
    pipelineName: string,
    activityName: string,
    referenceId: string,
    connectionId: string
  ) => {
    console.log(`Mapping change: ${pipelineName}.${activityName} -> ${referenceId} -> ${connectionId}`);
    
    // Update the pipelineConnectionMappings state
    setPipelineConnectionMappings(prev => {
      const pipelineMappings = prev[pipelineName] || {};
      const activityMapping = pipelineMappings[activityName] || {};
      
      // Store the connection ID for this reference
      const updatedMapping = {
        ...activityMapping,
        selectedConnectionId: connectionId,
        activityName,
        referenceId
      };
      
      return {
        ...prev,
        [pipelineName]: {
          ...pipelineMappings,
          [activityName]: updatedMapping
        }
      };
    });

    // Dispatch to global state
    dispatch({
      type: 'UPDATE_PIPELINE_CONNECTION_MAPPING',
      payload: {
        pipelineName,
        activityName,
        mapping: {
          activityName,
          activityType: 'unified', // Will be determined from summary
          selectedConnectionId: connectionId,
          referenceId
        }
      }
    });
  };

  // NEW: Simplified handler for referenceId-based mappings (used by ComponentMappingTableV2)
  const handleReferenceMapping = (
    pipelineName: string,
    referenceId: string,
    connectionId: string
  ) => {
    console.log(`Reference mapping: ${pipelineName} -> ${referenceId} -> ${connectionId}`);
    
    // Update the new referenceId-based mappings (fixes dropdown persistence)
    setPipelineReferenceMappings(prev => {
      const pipelineMappings = prev[pipelineName] || {};
      
      return {
        ...prev,
        [pipelineName]: {
          ...pipelineMappings,
          [referenceId]: connectionId
        }
      };
    });
  };

  const getTargetTypeOptions = (sourceType: string) => {
    return TARGET_TYPE_OPTIONS[sourceType] || TARGET_TYPE_OPTIONS.pipeline;
  };

  const renderConnectionOptions = (
    reference: ActivityLinkedServiceReference,
    uniqueId: string
  ) => {
    const isInvokePipeline = reference.referenceLocation === 'invokePipeline';
    const filteredConnectionOptions = existingConnections.filter(connection =>
      isInvokePipeline
        ? connection.connectionDetails.type === 'FabricDataPipelines'
        : connection.connectionDetails.type !== 'FabricDataPipelines'
    );

    if (filteredConnectionOptions.length === 0) {
      return (
        <SelectItem value="" disabled>
          {loadingConnections
            ? 'Loading Fabric connections...'
            : isInvokePipeline
            ? 'No FabricDataPipelines connections available'
            : 'No Fabric connections available'}
        </SelectItem>
      );
    }

    return filteredConnectionOptions.map(connection => (
      <SelectItem key={`${uniqueId}-${connection.id}`} value={connection.id}>
        <div className="flex flex-col text-left">
          <span className="font-medium">{connection.displayName}</span>
          <span className="text-xs text-muted-foreground">
            {connection.connectionDetails.type} • {ExistingConnectionsService.formatConnectivityType(connection.connectivityType)}
          </span>
          <span className="text-xs text-muted-foreground">ID: {connection.id}</span>
        </div>
      </SelectItem>
    ));
  };

  return (
    <WizardLayout
      title="Map Components"
      description="Configure how Data Factory components will be created in Microsoft Fabric"
    >
      <div className="space-y-6">
        <WorkspaceDisplay />

        {state.linkedServiceConnectionBridge && Object.keys(state.linkedServiceConnectionBridge).length > 0 && (
          <Card className="border-accent bg-accent/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent">
                <CheckCircle size={20} weight="fill" />
                Intelligent Mapping Bridge Active
              </CardTitle>
              <CardDescription>
                Connection mappings from the Configure Connections step have been automatically applied
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    LinkedServices Mapped
                  </div>
                  <div className="text-2xl font-bold text-accent">
                    {Object.keys(state.linkedServiceConnectionBridge).length}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    Auto-Applied Mappings
                  </div>
                  <div className="text-2xl font-bold text-accent">
                    {autoSelectedMappings.length}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    Coverage
                  </div>
                  <div className="text-2xl font-bold text-accent">
                    {allRequiredMappings.length > 0 
                      ? Math.round(((allRequiredMappings.length - incompleteMappings.length) / allRequiredMappings.length) * 100)
                      : 100}%
                  </div>
                </div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <Info size={14} className="inline mr-1" />
                Manual adjustments can be made below. The bridge automatically maps LinkedServices to their configured Fabric Connections.
              </div>
            </CardContent>
          </Card>
        )}

        {autoSelectedMappings.length > 0 && (
          <Alert className="border-accent bg-accent/10">
            <Info size={16} />
            <AlertDescription>
              <div className="space-y-2 text-sm">
                <div className="font-medium text-accent-foreground">
                  Auto-applied {autoSelectedMappings.length} connection mapping
                  {autoSelectedMappings.length === 1 ? '' : 's'} from Configure Connections step
                </div>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {autoSelectedMappings.slice(0, 10).map((entry, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-accent">•</span>
                      <span>{entry}</span>
                    </li>
                  ))}
                  {autoSelectedMappings.length > 10 && (
                    <li className="text-accent">
                      ... and {autoSelectedMappings.length - 10} more auto-applied mappings
                    </li>
                  )}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Migration Mapping</CardTitle>
            <CardDescription>
              Review and customize how each Data Factory component will be migrated to Fabric
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info size={16} />
              <AlertDescription>
                All component names are preserved by default. Adjust them as needed below.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {Object.entries(componentsByType).map(([type, componentsOfType]) => {
            if (componentsOfType.length === 0) return null;

            const typeStats = {
              total: componentsOfType.length,
              selected: componentsOfType.filter(c =>
                (state.selectedComponents || []).some(sc => sc?.name === c.name)
              ).length,
              configured: componentsOfType.filter(c => c.fabricTarget?.type && c.fabricTarget?.name).length,
              needsMapping: componentsOfType.filter(c => {
                if (c.type !== 'pipeline') return false;
                const refs = getPipelineActivityReferences(c);
                if (refs.length === 0) return false;
                const pipelineMappings = pipelineConnectionMappings[c.name] || {};
                const completed = Object.values(pipelineMappings).filter((m: any) => m?.selectedConnectionId).length;
                return completed < refs.length;
              }).length
            };

            // NEW: Use ComponentMappingTableV2 for pipelines (unified table UI)
            if (type === 'pipeline') {
              return (
                <Card key={type}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 capitalize">
                          Pipeline Activities & LinkedService Mappings
                          <Badge variant="secondary">{typeStats.total}</Badge>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {typeStats.selected} selected pipelines • Map all activity LinkedService references to Fabric connections
                          {typeStats.needsMapping > 0 && (
                            <span className="text-warning"> • {typeStats.needsMapping} need mapping</span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {generatingSummaries ? (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
                        <p className="text-sm">Analyzing pipeline activities...</p>
                      </div>
                    ) : pipelineSummaries.length === 0 ? (
                      <Alert>
                        <Info size={16} />
                        <AlertDescription>
                          No pipelines selected or no activity mappings required.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <ComponentMappingTableV2
                        pipelineSummaries={pipelineSummaries}
                        selectedPipelines={state.selectedComponents?.filter(c => c.type === 'pipeline').map(p => p.name) || []}
                        onPipelineToggle={handlePipelineToggle}
                        onBulkPipelineToggle={handleBulkPipelineToggle}
                        onActivityConnectionMapping={handleReferenceMapping}
                        pipelineConnectionMappings={pipelineReferenceMappings}
                        existingConnections={existingConnections}
                        loadingConnections={loadingConnections}
                        autoSelectedMappings={autoSelectedMappings}
                        componentType="pipeline"
                        showActivityDetails={true}
                        enableExpandAll={true}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            }

            // Use ComponentMappingTable for non-pipeline components
            return (
              <Card key={type}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 capitalize">
                        {type.replace(/([A-Z])/g, ' $1').trim()}
                        <Badge variant="secondary">{typeStats.total}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {typeStats.selected} selected • {typeStats.configured} configured
                        {typeStats.needsMapping > 0 && (
                          <span className="text-warning"> • {typeStats.needsMapping} need mapping</span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ComponentMappingTable
                    components={componentsOfType}
                    selectedComponents={state.selectedComponents || []}
                    onToggle={handleToggle}
                    onBulkToggle={handleBulkToggle}
                    onTargetTypeChange={handleTargetTypeChange}
                    onTargetNameChange={handleTargetNameChange}
                    onTargetConfigChange={handleTargetConfigChange}
                    onActivityConnectionMapping={handleActivityConnectionMapping}
                    getPipelineActivityReferences={getPipelineActivityReferences}
                    pipelineConnectionMappings={pipelineConnectionMappings}
                    existingConnections={existingConnections}
                    loadingConnections={loadingConnections}
                    autoSelectedMappings={autoSelectedMappings}
                    componentType={type}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* REMOVED: Old Custom Activities Section - now integrated into pipeline cards */}

        <Card>
          <CardHeader>
            <CardTitle>Migration Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Components are deployed in the following order to respect dependencies:
              </p>
              <ol className="ml-4 space-y-1">
                <li>1. <strong>Gateways</strong> – Integration runtimes</li>
                <li>2. <strong>Connectors</strong> – Fabric connections (from LinkedServices)</li>
                <li>3. <strong>Variables</strong> – Global parameters</li>
                <li>4. <strong>Data Pipelines</strong> – With activity mappings applied</li>
                <li>5. <strong>Schedules</strong> – Triggers and automation</li>
                <li>6. <strong>Notebooks</strong> – Custom activities and scripts</li>
              </ol>
              <div className="rounded-lg bg-info/10 p-3 text-sm text-info-foreground">
                <strong>Note:</strong> LinkedServices are configured in the prior step. Pipeline activities
                will reference the selected Fabric connections via their connection IDs.
              </div>
            </div>
          </CardContent>
        </Card>

        {(!allComponentsHaveTargets || !allMappingsComplete) && (
          <Card className="border-warning bg-warning/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info size={20} className="mt-0.5 text-warning" />
                <div className="space-y-2 text-sm">
                  <h4 className="font-medium text-foreground">Configuration required before continuing</h4>
                  <p className="text-muted-foreground">
                    Complete the following items to enable navigation to the next step.
                  </p>

                  {componentsMissingTargets.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-medium text-muted-foreground">Components missing Fabric targets:</p>
                      <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                        {componentsMissingTargets.slice(0, 5).map((component, index) => (
                          <li key={index}>
                            {component?.name} ({component?.type})
                          </li>
                        ))}
                        {componentsMissingTargets.length > 5 && (
                          <li>... and {componentsMissingTargets.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {!allMappingsComplete && (
                    <div className="space-y-1">
                      <p className="font-medium text-muted-foreground">
                        Pipeline activities missing connection mappings:
                      </p>
                      <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                        {incompleteMappings.slice(0, 5).map((mapping, index) => (
                          <li key={index}>
                            {mapping.pipelineName} → {mapping.activityName} (LinkedService: {mapping.linkedServiceName})
                          </li>
                        ))}
                        {incompleteMappings.length > 5 && (
                          <li>... and {incompleteMappings.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <NavigationDebug
          customConditions={[
            {
              label: 'Fabric connections loaded',
              condition: !loadingConnections,
              description: 'Existing Fabric connections must be loaded to map activities.'
            },
            {
              label: 'Components have Fabric targets',
              condition: allComponentsHaveTargets,
              description: 'Each selected component needs a Fabric target configuration.'
            },
            {
              label: 'Pipeline mappings complete',
              condition: allMappingsComplete,
              description: 'All pipeline activities must be mapped to Fabric connections.'
            }
          ]}
        />
      </div>
    </WizardLayout>
  );
}