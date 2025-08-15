"""
Alternative local Power BI Desktop model explorer using DAX queries instead of DMVs.
This approach should be more reliable with Power BI Desktop instances.
"""

import json
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

class DAXBasedLocalExplorer:
    """
    Utility class for exploring local Power BI Desktop semantic models
    using DAX queries instead of DMV queries for better compatibility.
    """
    
    def __init__(self, connection_string: str):
        """
        Initialize the explorer with a local connection string.
        
        Args:
            connection_string: Local connection string (e.g., "Data Source=localhost:51542")
        """
        self.connection_string = connection_string
    
    def get_tables_via_dax(self) -> List[Dict[str, Any]]:
        """
        Get all tables using DAX INFO.TABLES() function.
        
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
                # Use DAX INFO.TABLES() to get table information
                cmd = conn.CreateCommand()
                cmd.CommandText = "EVALUATE INFO.TABLES()"
                
                reader = cmd.ExecuteReader()
                tables = []
                
                while reader.Read():
                    # Extract table information from INFO.TABLES() result
                    table = {
                        'id': str(reader['[ID]']) if reader['[ID]'] is not None else '',
                        'name': str(reader['[Name]']) if reader['[Name]'] is not None else '',
                        'data_category': str(reader['[DataCategory]']) if reader['[DataCategory]'] is not None else '',
                        'description': str(reader['[Description]']) if reader['[Description]'] is not None else '',
                        'is_hidden': bool(reader['[IsHidden]']) if reader['[IsHidden]'] is not None else False,
                        'is_visible': not bool(reader['[IsHidden]']) if reader['[IsHidden]'] is not None else True,
                        'modified_time': str(reader['[ModifiedTime]']) if reader['[ModifiedTime]'] is not None else '',
                        'lineage_tag': str(reader['[LineageTag]']) if reader['[LineageTag]'] is not None else ''
                    }
                    tables.append(table)
                
                reader.Close()
                conn.Close()
                
                return tables
                
            except Exception as query_error:
                conn.Close()
                logger.error(f"Error querying tables via DAX: {str(query_error)}")
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e
    
    def get_columns_via_dax(self, table_name: str = None) -> List[Dict[str, Any]]:
        """
        Get columns using DAX INFO.COLUMNS() function.
        
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
                # Use DAX to join columns with table names
                cmd = conn.CreateCommand()
                
                if table_name:
                    # Filter for specific table by joining with table info
                    cmd.CommandText = f"""
                    EVALUATE
                    ADDCOLUMNS(
                        FILTER(INFO.COLUMNS(), 
                            [TableID] IN VALUES(
                                SELECTCOLUMNS(
                                    FILTER(INFO.TABLES(), [Name] = "{table_name}"),
                                    [ID]
                                )
                            )
                        ),
                        "TableName", 
                        RELATED(INFO.TABLES()[Name])
                    )
                    """
                else:
                    # Get all columns with table names - simpler approach
                    cmd.CommandText = "EVALUATE INFO.COLUMNS()"
                
                reader = cmd.ExecuteReader()
                columns = []
                
                while reader.Read():
                    column = {
                        'table_id': str(reader['[TableID]']) if reader['[TableID]'] is not None else '',
                        'table_name': str(reader['[TableName]']) if reader['[TableName]'] is not None else '',
                        'column_id': str(reader['[ID]']) if reader['[ID]'] is not None else '',
                        'explicit_name': str(reader['[ExplicitName]']) if reader['[ExplicitName]'] is not None else '',
                        'inferred_name': str(reader['[InferredName]']) if reader['[InferredName]'] is not None else '',
                        'data_type': str(reader['[ExplicitDataType]']) if reader['[ExplicitDataType]'] is not None else '',
                        'is_hidden': bool(reader['[IsHidden]']) if reader['[IsHidden]'] is not None else False,
                        'is_visible': not bool(reader['[IsHidden]']) if reader['[IsHidden]'] is not None else True,
                        'is_key': bool(reader['[IsKey]']) if reader['[IsKey]'] is not None else False,
                        'description': str(reader['[Description]']) if reader['[Description]'] is not None else '',
                        'display_folder': str(reader['[DisplayFolder]']) if reader['[DisplayFolder]'] is not None else '',
                        'expression': str(reader['[Expression]']) if reader['[Expression]'] is not None else '',
                        'lineage_tag': str(reader['[LineageTag]']) if reader['[LineageTag]'] is not None else ''
                    }
                    columns.append(column)
                
                reader.Close()
                conn.Close()
                
                return columns
                
            except Exception as query_error:
                conn.Close()
                logger.error(f"Error querying columns via DAX: {str(query_error)}")
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e
    
    def get_measures_via_dax(self) -> List[Dict[str, Any]]:
        """
        Get measures using DAX INFO.MEASURES() function.
        
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
                # Use DAX to join measures with table names - simpler approach
                cmd = conn.CreateCommand()
                cmd.CommandText = "EVALUATE INFO.MEASURES()"
                
                reader = cmd.ExecuteReader()
                measures = []
                
                while reader.Read():
                    measure = {
                        'table_id': str(reader['[TableID]']) if reader['[TableID]'] is not None else '',
                        'table_name': str(reader['[TableName]']) if reader['[TableName]'] is not None else '',
                        'measure_id': str(reader['[ID]']) if reader['[ID]'] is not None else '',
                        'name': str(reader['[Name]']) if reader['[Name]'] is not None else '',
                        'description': str(reader['[Description]']) if reader['[Description]'] is not None else '',
                        'expression': str(reader['[Expression]']) if reader['[Expression]'] is not None else '',
                        'is_hidden': bool(reader['[IsHidden]']) if reader['[IsHidden]'] is not None else False,
                        'is_visible': not bool(reader['[IsHidden]']) if reader['[IsHidden]'] is not None else True,
                        'display_folder': str(reader['[DisplayFolder]']) if reader['[DisplayFolder]'] is not None else '',
                        'data_type': str(reader['[DataType]']) if reader['[DataType]'] is not None else '',
                        'format_string': str(reader['[FormatString]']) if reader['[FormatString]'] is not None else '',
                        'lineage_tag': str(reader['[LineageTag]']) if reader['[LineageTag]'] is not None else ''
                    }
                    measures.append(measure)
                
                reader.Close()
                conn.Close()
                
                return measures
                
            except Exception as query_error:
                conn.Close()
                logger.error(f"Error querying measures via DAX: {str(query_error)}")
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e

def explore_local_powerbi_model_dax(connection_string: str, operation: str = 'tables', table_name: str = None) -> str:
    """
    Explore a local Power BI Desktop model using DAX-based approach.
    
    Args:
        connection_string: Connection string for local Power BI Desktop
        operation: Type of exploration ('tables', 'columns', 'measures')
        table_name: Optional table name for column queries
        
    Returns:
        JSON string with exploration results
    """
    try:
        explorer = DAXBasedLocalExplorer(connection_string)
        
        if operation == 'tables':
            tables = explorer.get_tables_via_dax()
            return json.dumps({
                'success': True,
                'operation': 'tables',
                'connection_string': connection_string,
                'total_tables': len(tables),
                'tables': tables,
                'method': 'DAX INFO.TABLES()'
            }, indent=2)
            
        elif operation == 'columns':
            columns = explorer.get_columns_via_dax(table_name)
            return json.dumps({
                'success': True,
                'operation': 'columns',
                'connection_string': connection_string,
                'table_name': table_name,
                'total_columns': len(columns),
                'columns': columns,
                'method': 'DAX INFO.COLUMNS()'
            }, indent=2)
            
        elif operation == 'measures':
            measures = explorer.get_measures_via_dax()
            return json.dumps({
                'success': True,
                'operation': 'measures',
                'connection_string': connection_string,
                'total_measures': len(measures),
                'measures': measures,
                'method': 'DAX INFO.MEASURES()'
            }, indent=2)
            
        else:
            return json.dumps({
                'success': False,
                'error': f"Unknown operation: {operation}",
                'supported_operations': ['tables', 'columns', 'measures']
            })
            
    except Exception as e:
        logger.error(f"Error exploring local Power BI model via DAX: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'operation': operation,
            'connection_string': connection_string,
            'method': 'DAX-based exploration'
        })
