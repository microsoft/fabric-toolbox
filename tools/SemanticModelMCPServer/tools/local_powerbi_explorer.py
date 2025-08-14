"""
Local Power BI Desktop Model Explorer

This module provides functionality to explore semantic models running in 
local Power BI Desktop instances, including listing tables, columns, measures,
and relationships without requiring Power BI Service authentication.
"""

import json
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

class LocalPowerBIModelExplorer:
    """
    Utility class for exploring local Power BI Desktop semantic models
    using direct Analysis Services connections.
    """
    
    def __init__(self, connection_string: str):
        """
        Initialize the explorer with a local connection string.
        
        Args:
            connection_string: Local connection string (e.g., "Data Source=localhost:51542")
        """
        self.connection_string = connection_string
    
    def get_tables(self) -> List[Dict[str, Any]]:
        """
        Get all tables in the local Power BI Desktop model.
        
        Returns:
            List of dictionaries containing table information
        """
        try:
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Connect to local Power BI Desktop
            conn = AdomdConnection(self.connection_string)
            conn.Open()
            
            try:
                # Query DMV to get table information using a simpler approach
                cmd = conn.CreateCommand()
                cmd.CommandText = """
                SELECT 
                    [DIMENSION_NAME] as TableName,
                    [DIMENSION_CAPTION] as TableCaption,
                    [DIMENSION_TYPE] as DimensionType,
                    [DIMENSION_CARDINALITY] as RowCount,
                    [IS_VISIBLE] as IsVisible
                FROM $SYSTEM.MDSCHEMA_DIMENSIONS
                WHERE [CUBE_NAME] = 'Model'
                ORDER BY [DIMENSION_NAME]
                """
                
                reader = cmd.ExecuteReader()
                tables = []
                
                while reader.Read():
                    table = {
                        'name': str(reader['TableName']),
                        'caption': str(reader['TableCaption']) if reader['TableCaption'] else str(reader['TableName']),
                        'type': str(reader['DimensionType']) if reader['DimensionType'] else 'Regular',
                        'row_count': int(reader['RowCount']) if reader['RowCount'] else 0,
                        'description': '',  # Description not available in this DMV
                        'is_visible': bool(reader['IsVisible']) if reader['IsVisible'] else True
                    }
                    tables.append(table)
                
                reader.Close()
                conn.Close()
                
                return tables
                
            except Exception as query_error:
                conn.Close()
                logger.error(f"Error querying tables: {str(query_error)}")
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e
    
    def get_columns(self, table_name: str = None) -> List[Dict[str, Any]]:
        """
        Get columns for a specific table or all tables.
        
        Args:
            table_name: Optional table name to filter columns
            
        Returns:
            List of dictionaries containing column information
        """
        try:
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Connect to local Power BI Desktop
            conn = AdomdConnection(self.connection_string)
            conn.Open()
            
            try:
                # Query DMV to get column information
                cmd = conn.CreateCommand()
                
                if table_name:
                    cmd.CommandText = f"""
                    SELECT 
                        [DIMENSION_UNIQUE_NAME] as TableName,
                        [LEVEL_NAME] as ColumnName,
                        [LEVEL_CAPTION] as ColumnCaption,
                        [LEVEL_TYPE] as ColumnType,
                        [LEVEL_CARDINALITY] as Cardinality,
                        [DESCRIPTION] as Description,
                        [IS_VISIBLE] as IsVisible
                    FROM $SYSTEM.MDSCHEMA_LEVELS
                    WHERE [CUBE_NAME] = 'Model' 
                    AND [DIMENSION_UNIQUE_NAME] = '[{table_name}]'
                    ORDER BY [LEVEL_NUMBER]
                    """
                else:
                    cmd.CommandText = """
                    SELECT 
                        [DIMENSION_UNIQUE_NAME] as TableName,
                        [LEVEL_NAME] as ColumnName,
                        [LEVEL_CAPTION] as ColumnCaption,
                        [LEVEL_TYPE] as ColumnType,
                        [LEVEL_CARDINALITY] as Cardinality,
                        [DESCRIPTION] as Description,
                        [IS_VISIBLE] as IsVisible
                    FROM $SYSTEM.MDSCHEMA_LEVELS
                    WHERE [CUBE_NAME] = 'Model'
                    ORDER BY [DIMENSION_UNIQUE_NAME], [LEVEL_NUMBER]
                    """
                
                reader = cmd.ExecuteReader()
                columns = []
                
                while reader.Read():
                    # Clean up table name (remove brackets)
                    table_name_clean = str(reader['TableName']).strip('[]')
                    
                    column = {
                        'table_name': table_name_clean,
                        'column_name': str(reader['ColumnName']),
                        'column_caption': str(reader['ColumnCaption']) if reader['ColumnCaption'] else str(reader['ColumnName']),
                        'column_type': str(reader['ColumnType']) if reader['ColumnType'] else 'Regular',
                        'cardinality': int(reader['Cardinality']) if reader['Cardinality'] else 0,
                        'description': str(reader['Description']) if reader['Description'] else '',
                        'is_visible': bool(reader['IsVisible']) if reader['IsVisible'] else True
                    }
                    columns.append(column)
                
                reader.Close()
                conn.Close()
                
                return columns
                
            except Exception as query_error:
                conn.Close()
                logger.error(f"Error querying columns: {str(query_error)}")
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e
    
    def get_measures(self) -> List[Dict[str, Any]]:
        """
        Get all measures in the local Power BI Desktop model.
        
        Returns:
            List of dictionaries containing measure information
        """
        try:
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Connect to local Power BI Desktop
            conn = AdomdConnection(self.connection_string)
            conn.Open()
            
            try:
                # Query DMV to get measure information
                cmd = conn.CreateCommand()
                cmd.CommandText = """
                SELECT 
                    [MEASURE_NAME] as MeasureName,
                    [MEASURE_CAPTION] as MeasureCaption,
                    [MEASURE_AGGREGATOR] as Aggregator,
                    [DATA_TYPE] as DataType,
                    [MEASURE_IS_VISIBLE] as IsVisible
                FROM $SYSTEM.MDSCHEMA_MEASURES
                WHERE [CUBE_NAME] = 'Model'
                ORDER BY [MEASURE_NAME]
                """
                
                reader = cmd.ExecuteReader()
                measures = []
                
                while reader.Read():
                    measure = {
                        'name': str(reader['MeasureName']),
                        'caption': str(reader['MeasureCaption']) if reader['MeasureCaption'] else str(reader['MeasureName']),
                        'aggregator': str(reader['Aggregator']) if reader['Aggregator'] else '',
                        'data_type': str(reader['DataType']) if reader['DataType'] else '',
                        'description': '',  # Description not available in this DMV
                        'is_visible': bool(reader['IsVisible']) if reader['IsVisible'] else True,
                        'expression': ''  # Expression not available in this DMV
                    }
                    measures.append(measure)
                
                reader.Close()
                conn.Close()
                
                return measures
                
            except Exception as query_error:
                conn.Close()
                logger.error(f"Error querying measures: {str(query_error)}")
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e
    
    def execute_dax_query(self, dax_query: str) -> Dict[str, Any]:
        """
        Execute a DAX query against the local Power BI Desktop model.
        
        Args:
            dax_query: DAX query to execute
            
        Returns:
            Dictionary containing query results
        """
        try:
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Connect to local Power BI Desktop
            conn = AdomdConnection(self.connection_string)
            conn.Open()
            
            try:
                # Execute DAX query
                cmd = conn.CreateCommand()
                cmd.CommandText = dax_query
                
                reader = cmd.ExecuteReader()
                
                # Get column information
                columns = []
                for i in range(reader.FieldCount):
                    columns.append({
                        'name': reader.GetName(i),
                        'type': str(reader.GetFieldType(i))
                    })
                
                # Get data rows
                rows = []
                while reader.Read():
                    row = []
                    for i in range(reader.FieldCount):
                        value = reader.GetValue(i)
                        row.append(str(value) if value is not None else None)
                    rows.append(row)
                
                reader.Close()
                conn.Close()
                
                return {
                    'success': True,
                    'columns': columns,
                    'rows': rows,
                    'row_count': len(rows),
                    'query': dax_query
                }
                
            except Exception as query_error:
                conn.Close()
                logger.error(f"Error executing DAX query: {str(query_error)}")
                return {
                    'success': False,
                    'error': str(query_error),
                    'query': dax_query
                }
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'query': dax_query
            }

def explore_local_powerbi_model(connection_string: str, operation: str = 'tables', table_name: str = None) -> str:
    """
    Explore a local Power BI Desktop model.
    
    Args:
        connection_string: Connection string for local Power BI Desktop
        operation: Type of exploration ('tables', 'columns', 'measures')
        table_name: Optional table name for column queries
        
    Returns:
        JSON string with exploration results
    """
    try:
        explorer = LocalPowerBIModelExplorer(connection_string)
        
        if operation == 'tables':
            tables = explorer.get_tables()
            return json.dumps({
                'success': True,
                'operation': 'tables',
                'connection_string': connection_string,
                'total_tables': len(tables),
                'tables': tables
            }, indent=2)
            
        elif operation == 'columns':
            columns = explorer.get_columns(table_name)
            return json.dumps({
                'success': True,
                'operation': 'columns',
                'connection_string': connection_string,
                'table_name': table_name,
                'total_columns': len(columns),
                'columns': columns
            }, indent=2)
            
        elif operation == 'measures':
            measures = explorer.get_measures()
            return json.dumps({
                'success': True,
                'operation': 'measures',
                'connection_string': connection_string,
                'total_measures': len(measures),
                'measures': measures
            }, indent=2)
            
        else:
            return json.dumps({
                'success': False,
                'error': f"Unknown operation: {operation}",
                'supported_operations': ['tables', 'columns', 'measures']
            })
            
    except Exception as e:
        logger.error(f"Error exploring local Power BI model: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'operation': operation,
            'connection_string': connection_string
        })

def execute_local_dax_query(connection_string: str, dax_query: str) -> str:
    """
    Execute a DAX query against a local Power BI Desktop model.
    
    Args:
        connection_string: Connection string for local Power BI Desktop
        dax_query: DAX query to execute
        
    Returns:
        JSON string with query results
    """
    try:
        explorer = LocalPowerBIModelExplorer(connection_string)
        result = explorer.execute_dax_query(dax_query)
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error executing local DAX query: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'query': dax_query,
            'connection_string': connection_string
        })
