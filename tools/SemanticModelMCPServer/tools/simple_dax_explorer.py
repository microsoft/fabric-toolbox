"""
Simple local Power BI Desktop explorer using basic DAX queries.
"""

import json
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

class SimpleDaxLocalExplorer:
    """
    Simple utility class for exploring local Power BI Desktop semantic models
    using basic DAX queries without complex JOINs.
    """
    
    def __init__(self, connection_string: str):
        """
        Initialize the explorer with a local connection string.
        
        Args:
            connection_string: Local connection string (e.g., "Data Source=localhost:51542")
        """
        self.connection_string = connection_string
        self._table_cache = None
    
    def _get_table_mapping(self) -> Dict[str, str]:
        """Get mapping of table IDs to table names."""
        if self._table_cache is not None:
            return self._table_cache
            
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
                cmd = conn.CreateCommand()
                cmd.CommandText = "EVALUATE INFO.TABLES()"
                
                reader = cmd.ExecuteReader()
                table_mapping = {}
                
                while reader.Read():
                    table_id = str(reader['[ID]'])
                    table_name = str(reader['[Name]'])
                    table_mapping[table_id] = table_name
                
                reader.Close()
                conn.Close()
                
                self._table_cache = table_mapping
                return table_mapping
                
            except Exception as query_error:
                conn.Close()
                raise query_error
                
        except Exception as e:
            logger.error(f"Error getting table mapping: {str(e)}")
            return {}
    
    def get_tables_simple(self) -> List[Dict[str, Any]]:
        """Get all tables using basic DAX INFO.TABLES() function."""
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
                cmd = conn.CreateCommand()
                cmd.CommandText = "EVALUATE INFO.TABLES()"
                
                reader = cmd.ExecuteReader()
                tables = []
                
                while reader.Read():
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
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e
    
    def get_columns_simple(self, table_name: str = None) -> List[Dict[str, Any]]:
        """Get columns using basic DAX INFO.COLUMNS() function."""
        try:
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Get table mapping
            table_mapping = self._get_table_mapping()
            
            # Connect to local Power BI Desktop
            conn = AdomdConnection(self.connection_string)
            conn.Open()
            
            try:
                cmd = conn.CreateCommand()
                cmd.CommandText = "EVALUATE INFO.COLUMNS()"
                
                reader = cmd.ExecuteReader()
                columns = []
                
                while reader.Read():
                    table_id = str(reader['[TableID]'])
                    mapped_table_name = table_mapping.get(table_id, 'Unknown')
                    
                    # Filter by table name if specified
                    if table_name and mapped_table_name != table_name:
                        continue
                    
                    column = {
                        'table_id': table_id,
                        'table_name': mapped_table_name,
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
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e
    
    def get_measures_simple(self) -> List[Dict[str, Any]]:
        """Get measures using basic DAX INFO.MEASURES() function."""
        try:
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Get table mapping
            table_mapping = self._get_table_mapping()
            
            # Connect to local Power BI Desktop
            conn = AdomdConnection(self.connection_string)
            conn.Open()
            
            try:
                cmd = conn.CreateCommand()
                cmd.CommandText = "EVALUATE INFO.MEASURES()"
                
                reader = cmd.ExecuteReader()
                measures = []
                
                while reader.Read():
                    table_id = str(reader['[TableID]'])
                    mapped_table_name = table_mapping.get(table_id, 'Unknown')
                    
                    measure = {
                        'table_id': table_id,
                        'table_name': mapped_table_name,
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
                raise query_error
                
        except Exception as e:
            logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
            raise e

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
        import clr
        import os
        
        # Add references to Analysis Services libraries
        current_dir = os.path.dirname(os.path.abspath(__file__))
        dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
        
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
        from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
        
        # Connect to local Power BI Desktop
        conn = AdomdConnection(connection_string)
        conn.Open()
        
        try:
            cmd = conn.CreateCommand()
            cmd.CommandText = dax_query
            
            reader = cmd.ExecuteReader()
            
            # Get column information
            columns = []
            for i in range(reader.FieldCount):
                columns.append({
                    'name': reader.GetName(i),
                    'index': i
                })
            
            # Read data rows
            rows = []
            while reader.Read():
                row = {}
                for i in range(reader.FieldCount):
                    column_name = reader.GetName(i)
                    try:
                        value = reader[i]
                        # Convert to string for JSON serialization
                        if value is None:
                            row[column_name] = None
                        else:
                            row[column_name] = str(value)
                    except:
                        row[column_name] = "<unable to read>"
                rows.append(row)
            
            reader.Close()
            conn.Close()
            
            return json.dumps({
                'success': True,
                'connection_string': connection_string,
                'dax_query': dax_query,
                'columns': columns,
                'total_rows': len(rows),
                'rows': rows,
                'method': 'Direct DAX execution'
            }, indent=2)
            
        except Exception as query_error:
            conn.Close()
            logger.error(f"Error executing DAX query: {str(query_error)}")
            raise query_error
            
    except Exception as e:
        logger.error(f"Error connecting to local Power BI Desktop: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'connection_string': connection_string,
            'dax_query': dax_query,
            'method': 'Direct DAX execution'
        })

def explore_local_powerbi_simple(connection_string: str, operation: str = 'tables', table_name: str = None) -> str:
    """
    Explore a local Power BI Desktop model using simple DAX approach.
    
    Args:
        connection_string: Connection string for local Power BI Desktop
        operation: Type of exploration ('tables', 'columns', 'measures')
        table_name: Optional table name for column queries
        
    Returns:
        JSON string with exploration results
    """
    try:
        explorer = SimpleDaxLocalExplorer(connection_string)
        
        if operation == 'tables':
            tables = explorer.get_tables_simple()
            return json.dumps({
                'success': True,
                'operation': 'tables',
                'connection_string': connection_string,
                'total_tables': len(tables),
                'tables': tables,
                'method': 'Simple DAX INFO.TABLES()'
            }, indent=2)
            
        elif operation == 'columns':
            columns = explorer.get_columns_simple(table_name)
            return json.dumps({
                'success': True,
                'operation': 'columns',
                'connection_string': connection_string,
                'table_name': table_name,
                'total_columns': len(columns),
                'columns': columns,
                'method': 'Simple DAX INFO.COLUMNS() with table mapping'
            }, indent=2)
            
        elif operation == 'measures':
            measures = explorer.get_measures_simple()
            return json.dumps({
                'success': True,
                'operation': 'measures',
                'connection_string': connection_string,
                'total_measures': len(measures),
                'measures': measures,
                'method': 'Simple DAX INFO.MEASURES() with table mapping'
            }, indent=2)
            
        else:
            return json.dumps({
                'success': False,
                'error': f"Unknown operation: {operation}",
                'supported_operations': ['tables', 'columns', 'measures']
            })
            
    except Exception as e:
        logger.error(f"Error exploring local Power BI model via simple DAX: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'operation': operation,
            'connection_string': connection_string,
            'method': 'Simple DAX-based exploration'
        })
