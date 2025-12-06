"""
Custom Activity 4-Tier Connection Resolver.

This module implements intelligent connection resolution for Custom activities
in ADF pipelines using a 4-tier fallback system for maximum compatibility.

The 4 resolution tiers are (in order):
1. Reference ID Lookup: Direct mapping via pipelineReferenceMappings
2. Activity Name Match: Find connection by activity-specific extended properties
3. Connection Bridge: Use linked service mapping bridge for connection metadata
4. Deployed Pipeline Fallback: Query Fabric for deployed pipeline and extract connection
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class CustomActivityResolver:
    """
    4-tier fallback system for Custom Activity connection resolution.
    
    When transforming Custom activities, this resolver attempts to find the correct
    Fabric connection using four strategies in order of preference:
    
    1. Tier 1 - Reference ID Direct Mapping:
       Fast lookup using stored reference ID mappings from previous transformations
       Example: referenceId "conn_123" → fabricConnectionId "fc-uuid"
    
    2. Tier 2 - Activity Name Property:
       Examine activity extended properties for an activityName that references
       a linked service that has been mapped to a Fabric connection
       Example: activity.typeProperties.extendedProperties.activityName "WebAPI"
    
    3. Tier 3 - Connection Bridge:
       Use the linked service bridge to extract metadata and find associated
       Fabric connection by type, endpoint, or other properties
       Example: linkedServiceBridge["AzureSQL"] → {"connectionType": "SQLServer", ...}
    
    4. Tier 4 - Deployed Pipeline Registry:
       Query Fabric for previously deployed pipelines that use the same custom
       activity, extract the connection they reference, and reuse it
       Example: Query deployedPipelineIdMap to find pipelines using same activity
    
    Example:
        >>> resolver = CustomActivityResolver()
        >>> resolver.set_reference_mappings({"pipeline1": {"ref1": "conn1"}})
        >>> resolver.set_connection_bridge({"AzureSQL": {"type": "SQLServer"}})
        >>> connection_id = resolver.resolve_connection(custom_activity)
        >>> print(f"Resolved to: {connection_id}")
    """
    
    def __init__(self):
        """Initialize the Custom Activity resolver."""
        # Tier 1: Direct reference mappings
        self._reference_mappings: Dict[str, Dict[str, str]] = {}
        
        # Tier 3: Connection bridge (linked service → Fabric connection)
        self._connection_bridge: Dict[str, Dict[str, Any]] = {}
        
        # Tier 4: Deployed pipeline mappings
        self._deployed_pipeline_map: Dict[str, str] = {}  # {adf_name: fabric_id}
        
        # Current pipeline context
        self._current_pipeline = ""
        
        # Resolution statistics for logging
        self._resolution_stats = {
            "tier1": 0,  # Direct reference ID
            "tier2": 0,  # Activity name
            "tier3": 0,  # Connection bridge
            "tier4": 0,  # Deployed pipeline
            "failed": 0,  # Could not resolve
        }
    
    def set_reference_mappings(self, mappings: Dict[str, Dict[str, str]]) -> None:
        """
        Set Tier 1 mappings for direct reference ID lookup.
        
        Args:
            mappings: Dictionary structure:
                {
                    "pipeline_name": {
                        "ref_id_1": "fabric_connection_id_1",
                        "ref_id_2": "fabric_connection_id_2"
                    }
                }
        """
        self._reference_mappings = mappings
        logger.info(f"Configured {len(mappings)} reference ID mappings for {sum(len(v) for v in mappings.values())} references")
    
    def set_connection_bridge(self, bridge: Dict[str, Dict[str, Any]]) -> None:
        """
        Set Tier 3 mapping for linked service to Fabric connection bridge.
        
        Args:
            bridge: Dictionary mapping linked service names to their metadata:
                {
                    "AzureSQL": {
                        "fabric_type": "SQLServer",
                        "properties": {...}
                    },
                    "AzureBlobStorage": {
                        "fabric_type": "AzureDataLakeStorage",
                        "properties": {...}
                    }
                }
        """
        self._connection_bridge = bridge
        logger.info(f"Configured connection bridge with {len(bridge)} linked service mappings")
    
    def set_deployed_pipeline_map(self, deployed_map: Dict[str, str]) -> None:
        """
        Set Tier 4 deployed pipeline registry.
        
        Args:
            deployed_map: Dictionary mapping ADF pipeline names to Fabric pipeline IDs:
                {
                    "PipelineA": "fabric-pipeline-uuid-1",
                    "PipelineB": "fabric-pipeline-uuid-2"
                }
        """
        self._deployed_pipeline_map = deployed_map
        logger.info(f"Configured {len(deployed_map)} deployed pipeline mappings")
    
    def set_current_pipeline(self, pipeline_name: str) -> None:
        """
        Set the current pipeline being processed (for Tier 1 lookup context).
        
        Args:
            pipeline_name: Name of the pipeline being transformed
        """
        self._current_pipeline = pipeline_name
    
    def resolve_connection(self, activity: Dict[str, Any]) -> Optional[str]:
        """
        Resolve the Fabric connection for a Custom activity using 4-tier fallback.
        
        Args:
            activity: The Custom activity definition from ADF
            
        Returns:
            Fabric connection ID if resolved, None if all tiers fail
        """
        activity_name = activity.get("name", "Unknown")
        activity_type = activity.get("type", "Unknown")
        
        # Quick validation
        if activity_type != "Custom":
            logger.warning(f"resolve_connection called on non-Custom activity: {activity_type}")
            return None
        
        # Tier 1: Direct reference ID mapping
        connection_id = self._resolve_tier1_reference(activity)
        if connection_id:
            logger.debug(f"Activity '{activity_name}': Tier 1 (Reference ID) → {connection_id}")
            self._resolution_stats["tier1"] += 1
            return connection_id
        
        # Tier 2: Activity extended properties name matching
        connection_id = self._resolve_tier2_activity_name(activity)
        if connection_id:
            logger.debug(f"Activity '{activity_name}': Tier 2 (Activity Name) → {connection_id}")
            self._resolution_stats["tier2"] += 1
            return connection_id
        
        # Tier 3: Connection bridge lookup
        connection_id = self._resolve_tier3_bridge(activity)
        if connection_id:
            logger.debug(f"Activity '{activity_name}': Tier 3 (Connection Bridge) → {connection_id}")
            self._resolution_stats["tier3"] += 1
            return connection_id
        
        # Tier 4: Deployed pipeline fallback
        connection_id = self._resolve_tier4_deployed(activity)
        if connection_id:
            logger.debug(f"Activity '{activity_name}': Tier 4 (Deployed Pipeline) → {connection_id}")
            self._resolution_stats["tier4"] += 1
            return connection_id
        
        # No resolution found
        logger.warning(f"Activity '{activity_name}': Could not resolve connection through any tier")
        self._resolution_stats["failed"] += 1
        return None
    
    def _resolve_tier1_reference(self, activity: Dict[str, Any]) -> Optional[str]:
        """
        Tier 1: Direct reference ID mapping.
        
        Looks for stored mappings from this activity's reference ID to a Fabric connection.
        """
        if not self._current_pipeline or self._current_pipeline not in self._reference_mappings:
            return None
        
        type_props = activity.get("typeProperties", {})
        linked_service_ref = type_props.get("linkedServiceConnection", {})
        reference_name = linked_service_ref.get("referenceName")
        
        if not reference_name:
            return None
        
        pipeline_mappings = self._reference_mappings[self._current_pipeline]
        return pipeline_mappings.get(reference_name)
    
    def _resolve_tier2_activity_name(self, activity: Dict[str, Any]) -> Optional[str]:
        """
        Tier 2: Activity extended properties name matching.
        
        Examines activity.typeProperties.extendedProperties for references to
        linked services that can be mapped to Fabric connections.
        """
        type_props = activity.get("typeProperties", {})
        extended_props = type_props.get("extendedProperties", {})
        
        # Look for common patterns that reference linked services
        for prop_name, prop_value in extended_props.items():
            if isinstance(prop_value, str) and prop_value in self._connection_bridge:
                # Found a referenced linked service in extended properties
                bridge_entry = self._connection_bridge[prop_value]
                # Return the first available connection ID from bridge
                if "connection_id" in bridge_entry:
                    return bridge_entry["connection_id"]
        
        return None
    
    def _resolve_tier3_bridge(self, activity: Dict[str, Any]) -> Optional[str]:
        """
        Tier 3: Connection bridge lookup.
        
        Uses the linked service bridge to map connection metadata.
        Looks for typeProperties that reference known linked services.
        """
        type_props = activity.get("typeProperties", {})
        
        # Check various common linked service reference patterns
        ls_patterns = [
            "linkedServiceConnection",
            "linkedServices",
            "linkedServiceRef",
            "connection"
        ]
        
        for pattern in ls_patterns:
            if pattern in type_props:
                ls_ref = type_props[pattern]
                if isinstance(ls_ref, dict):
                    ref_name = ls_ref.get("referenceName")
                    if ref_name and ref_name in self._connection_bridge:
                        bridge_entry = self._connection_bridge[ref_name]
                        return bridge_entry.get("connection_id")
        
        return None
    
    def _resolve_tier4_deployed(self, activity: Dict[str, Any]) -> Optional[str]:
        """
        Tier 4: Deployed pipeline fallback.
        
        Queries the deployed pipeline registry to find previously deployed
        pipelines that use the same custom activity, extracts their connection.
        """
        activity_type_props = activity.get("typeProperties", {})
        
        # Look for any pipeline that's already deployed and uses this activity type
        # This is a best-effort fallback - not all pipelines will have this info
        
        # Check if this activity references a specific endpoint/type we can match
        if "command" in activity_type_props:
            # For Custom activities with explicit commands, try to find
            # another deployed pipeline with the same pattern
            for adf_name, fabric_id in self._deployed_pipeline_map.items():
                # This would need actual Fabric API query to be fully implemented
                # For now, return None as this is a complex operation
                pass
        
        return None
    
    def get_resolution_statistics(self) -> Dict[str, int]:
        """
        Get statistics about resolution attempts across all tiers.
        
        Returns:
            Dictionary with counts of successful resolutions at each tier
            and failed attempts:
                {
                    "tier1": 5,  # Successfully resolved using reference ID
                    "tier2": 2,  # Successfully resolved using activity name
                    "tier3": 3,  # Successfully resolved using bridge
                    "tier4": 0,  # Successfully resolved using deployed registry
                    "failed": 1  # Could not resolve
                }
        """
        return self._resolution_stats.copy()
    
    def print_resolution_summary(self) -> None:
        """Print a summary of resolution statistics."""
        total = sum(self._resolution_stats.values())
        if total == 0:
            logger.info("No Custom activities processed")
            return
        
        successful = total - self._resolution_stats["failed"]
        success_rate = (successful / total * 100) if total > 0 else 0
        
        logger.info("\n" + "=" * 70)
        logger.info("CUSTOM ACTIVITY CONNECTION RESOLUTION SUMMARY")
        logger.info("=" * 70)
        logger.info(f"Total Activities Processed: {total}")
        logger.info(f"Successfully Resolved: {successful} ({success_rate:.1f}%)")
        logger.info(f"  Tier 1 (Reference ID):     {self._resolution_stats['tier1']}")
        logger.info(f"  Tier 2 (Activity Name):    {self._resolution_stats['tier2']}")
        logger.info(f"  Tier 3 (Bridge):           {self._resolution_stats['tier3']}")
        logger.info(f"  Tier 4 (Deployed Registry): {self._resolution_stats['tier4']}")
        logger.info(f"Failed to Resolve: {self._resolution_stats['failed']}")
        logger.info("=" * 70)
