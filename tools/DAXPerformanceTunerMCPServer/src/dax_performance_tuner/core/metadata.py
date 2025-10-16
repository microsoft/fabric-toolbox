"""Model metadata utilities that operate on the active XMLA session."""

import json
from typing import Dict, Any, List, Optional, Tuple
from ..infrastructure.xmla import execute_dax_query_direct


def execute_dmv_query(xmla_endpoint: str, dataset_name: str, dmv_query: str) -> Any:
    try:
        raw_result = execute_dax_query_direct(xmla_endpoint, dataset_name, dmv_query)
        
        if raw_result.startswith("Error:"):
            return {"status": "error", "error": f"DMV query failed: {raw_result}"}
        
        parsed_result = json.loads(raw_result)
        
        rows = parsed_result.get("rows", [])
        return [
            {key.replace("[@", "").replace("]", ""): value for key, value in row.items()}
            for row in rows
        ]
        
    except json.JSONDecodeError as e:
        return {"status": "error", "error": f"Failed to parse DMV query result: {str(e)}"}
    except Exception as e:
        return {"status": "error", "error": f"DMV query execution failed: {str(e)}"}


def _run_metadata_query(
    xmla_endpoint: str,
    dataset_name: str,
    query: str,
    label: str,
) -> Optional[Dict[str, Any]]:
    """Execute metadata query and return parsed result or None on error."""
    raw_result = execute_dax_query_direct(xmla_endpoint, dataset_name, query)
    if raw_result.startswith("Error:"):
        return None

    try:
        return json.loads(raw_result)
    except json.JSONDecodeError:
        return None


def _execute_metadata_queries(xmla_endpoint: str, dataset_name: str) -> Dict[str, Any]:
    try:
        tables_query = """
        EVALUATE
        SELECTCOLUMNS(
            INFO.TABLES(),
            "@table_id", [ID],
            "@table_name", [Name],
            "@description", [Description],
            "@is_hidden", [IsHidden]
        )
        """

        columns_query = """
        EVALUATE
        SELECTCOLUMNS(
            INFO.COLUMNS(),
            "@column_id", [ID],
            "@table_id", [TableID],
            "@column_name", [ExplicitName],
            "@description", [Description],
            "@data_type", [ExplicitDataType],
            "@is_hidden", [IsHidden],
            "@format_string", [FormatString]
        )
        """

        measures_query = """
        EVALUATE
        SELECTCOLUMNS(
            INFO.MEASURES(),
            "@measure_id", [ID],
            "@table_id", [TableID],
            "@measure_name", [Name],
            "@description", [Description],
            "@expression", [Expression],
            "@format_string", [FormatString],
            "@is_hidden", [IsHidden],
            "@display_folder", [DisplayFolder]
        )
        """

        relationships_query = """
        EVALUATE
        SELECTCOLUMNS(
            INFO.RELATIONSHIPS(),
            "@from_table_id", [FromTableID],
            "@from_column_id", [FromColumnID],
            "@to_table_id", [ToTableID],
            "@to_column_id", [ToColumnID],
            "@cross_filtering_behavior", [CrossFilteringBehavior],
            "@is_active", [IsActive],
            "@from_cardinality", [FromCardinality],
            "@to_cardinality", [ToCardinality]
        )
        """

        column_names_query = """
        EVALUATE
        SELECTCOLUMNS(
            INFO.COLUMNS(),
            "@column_id", [ID],
            "@column_name", [ExplicitName]
        )
        """

        parsed_tables = _run_metadata_query(xmla_endpoint, dataset_name, tables_query, "tables")
        if not parsed_tables:
            return {"status": "error", "error": "Failed to retrieve table metadata"}
        parsed_columns = _run_metadata_query(xmla_endpoint, dataset_name, columns_query, "columns")
        if not parsed_columns:
            return {"status": "error", "error": "Failed to retrieve column metadata"}
        parsed_measures = _run_metadata_query(xmla_endpoint, dataset_name, measures_query, "measures")
        if not parsed_measures:
            return {"status": "error", "error": "Failed to retrieve measure metadata"}
        parsed_relationships = _run_metadata_query(xmla_endpoint, dataset_name, relationships_query, "relationships")
        if not parsed_relationships:
            return {"status": "error", "error": "Failed to retrieve relationship metadata"}
        parsed_column_names = _run_metadata_query(xmla_endpoint, dataset_name, column_names_query, "column names")
        if not parsed_column_names:
            return {"status": "error", "error": "Failed to retrieve column name metadata"}

        table_rows = parsed_tables.get("rows", [])
        column_rows = parsed_columns.get("rows", [])
        measure_rows = parsed_measures.get("rows", [])
        relationship_rows = parsed_relationships.get("rows", [])
        column_name_rows = parsed_column_names.get("rows", [])

        table_mapping, table_name_to_id = _build_table_mappings(table_rows)
        column_mapping = _build_column_mapping(column_name_rows)

        raw_data = {
            "tables": table_rows,
            "columns": column_rows,
            "measures": measure_rows,
            "relationships": relationship_rows,
        }
        
        mappings = {
            "table_mapping": table_mapping,
            "table_name_to_id": table_name_to_id,
            "column_mapping": column_mapping,
        }

        clean_output = _build_clean_output(raw_data, mappings, filter_table_ids=None)

        return {
            "status": "success",
            "raw_data": raw_data,
            "mappings": mappings,
            "clean_output": clean_output,
        }

    except Exception as e:
        return {"status": "error", "error": f"Failed to execute metadata queries: {str(e)}"}


def _build_table_mappings(tables_data: List[Dict]) -> Tuple[Dict[str, str], Dict[str, str]]:
    valid_rows = [(str(row.get("[@table_id]", "")), row.get("[@table_name]", "")) 
                  for row in tables_data 
                  if row.get("[@table_id]") and row.get("[@table_name]")]
    
    return (
        {row_id: row_name for row_id, row_name in valid_rows},
        {row_name: row_id for row_id, row_name in valid_rows}
    )


def _build_column_mapping(column_names_data: List[Dict]) -> Dict[str, str]:
    return {
        str(row.get("[@column_id]", "")): row.get("[@column_name]", "")
        for row in column_names_data
        if row.get("[@column_id]") and row.get("[@column_name]")
    }


def _build_clean_output(
    raw_data: Dict[str, List[Dict]],
    mappings: Dict[str, Any],
    filter_table_ids: Optional[set] = None
) -> Dict[str, Any]:
    table_mapping = mappings["table_mapping"]
    column_mapping = mappings["column_mapping"]
    
    clean_tables = []
    for table in raw_data["tables"]:
        table_id = str(table.get("[@table_id]", ""))
        if filter_table_ids is not None and table_id not in filter_table_ids:
            continue
        clean_tables.append({
            "table_name": table.get("[@table_name]", ""),
            "description": table.get("[@description]"),
            "is_hidden": table.get("[@is_hidden]") == "True"
        })
    
    clean_columns = []
    for column in raw_data["columns"]:
        table_id = str(column.get("[@table_id]", ""))
        if filter_table_ids is not None and table_id not in filter_table_ids:
            continue
        table_name = table_mapping.get(table_id, "Unknown")
        clean_columns.append({
            "table_name": table_name,
            "column_name": column.get("[@column_name]", ""),
            "description": column.get("[@description]"),
            "data_type": column.get("[@data_type]"),
            "is_hidden": column.get("[@is_hidden]") == "True",
            "format_string": column.get("[@format_string]")
        })
    
    clean_measures = []
    for measure in raw_data["measures"]:
        table_id = str(measure.get("[@table_id]", ""))
        if filter_table_ids is not None and table_id not in filter_table_ids:
            continue
        table_name = table_mapping.get(table_id, "Unknown")
        clean_measures.append({
            "table_name": table_name,
            "measure_name": measure.get("[@measure_name]", ""),
            "description": measure.get("[@description]"),
            "expression": measure.get("[@expression]", ""),
            "format_string": measure.get("[@format_string]"),
            "is_hidden": measure.get("[@is_hidden]") == "True",
            "display_folder": measure.get("[@display_folder]")
        })
    
    clean_relationships = []
    for rel in raw_data["relationships"]:
        from_table_id = str(rel.get("[@from_table_id]", ""))
        to_table_id = str(rel.get("[@to_table_id]", ""))
        
        # If filtering, only include relationships where both tables are in the filter set
        if filter_table_ids is not None:
            if from_table_id not in filter_table_ids or to_table_id not in filter_table_ids:
                continue
        
        from_column_id = str(rel.get("[@from_column_id]", ""))
        to_column_id = str(rel.get("[@to_column_id]", ""))
        
        from_table = table_mapping.get(from_table_id, "Unknown")
        to_table = table_mapping.get(to_table_id, "Unknown")
        from_column = column_mapping.get(from_column_id, "Unknown")
        to_column = column_mapping.get(to_column_id, "Unknown")
        
        cross_filter_behavior = rel.get("[@cross_filtering_behavior]", "")
        cross_filter_text = "Both" if cross_filter_behavior == "2" else "Single"
        
        clean_relationships.append({
            "from_table": from_table,
            "from_column": from_column,
            "to_table": to_table,
            "to_column": to_column,
            "cross_filtering": cross_filter_text,
            "is_active": rel.get("[@is_active]") == "True",
            "from_cardinality": "Many" if rel.get("[@from_cardinality]") == "2" else "One",
            "to_cardinality": "Many" if rel.get("[@to_cardinality]") == "2" else "One"
        })
    
    return {
        "status": "success",
        "summary": {
            "table_count": len(clean_tables),
            "column_count": len(clean_columns),
            "measure_count": len(clean_measures),
            "relationship_count": len(clean_relationships)
        },
        "relationships": clean_relationships,
        "tables": clean_tables,
        "columns": clean_columns,
        "measures": clean_measures
    }


def _filter_metadata_by_dependencies(
    metadata_result: Dict[str, Any], 
    dependencies_result: Dict[str, Any]
) -> Dict[str, Any]:
    try:
        dependencies = dependencies_result["dependencies"]
        tables_used = set(dependencies["tables_used"])
        
        if not tables_used:
            return {
                "status": "success",
                "summary": {"table_count": 0, "column_count": 0, "measure_count": 0, "relationship_count": 0},
                "relationships": [], "tables": [], "columns": [], "measures": []
            }
        
        raw_data = metadata_result["raw_data"]
        mappings = metadata_result["mappings"]
        table_mapping = mappings["table_mapping"]
        table_name_to_id = mappings["table_name_to_id"]
        
        expanded_tables = expand_tables_through_relationships(
            tables_used, raw_data["relationships"], table_mapping
        )
        
        relevant_table_ids = set()
        for table_name in expanded_tables:
            if table_name in table_name_to_id:
                relevant_table_ids.add(table_name_to_id[table_name])
        
        return _build_clean_output(raw_data, mappings, filter_table_ids=relevant_table_ids)
        
    except Exception as e:
        return {"status": "error", "error": f"Failed to filter metadata by dependencies: {str(e)}"}


def get_complete_model_definition(xmla_endpoint: str, dataset_name: str) -> Dict[str, Any]:
    # Use centralized query execution to eliminate duplication
    metadata_result = _execute_metadata_queries(xmla_endpoint, dataset_name)
    
    if metadata_result["status"] != "success":
        return metadata_result
    
    # Return only the clean output (no raw data exposure)  
    return metadata_result["clean_output"]


def get_query_dependencies(dax_query: str, xmla_endpoint: str, dataset_name: str) -> Dict[str, Any]:
    try:
        escaped_query = dax_query.replace('"', '""')
        
        dependency_query = f'''
        EVALUATE
        VAR source_query = "{escaped_query}"
        VAR all_dependencies = SELECTCOLUMNS(
            INFO.CALCDEPENDENCY("QUERY", source_query),
            "@referenced_object_type", [REFERENCED_OBJECT_TYPE],
            "@referenced_table", [REFERENCED_TABLE],
            "@referenced_object", [REFERENCED_OBJECT]
    )
    RETURN all_dependencies
    '''
        
        result = execute_dax_query_direct(xmla_endpoint, dataset_name, dependency_query)
        
        if result.startswith("Error:"):
            return {"status": "error", "error": f"Failed to get query dependencies: {result}"}
        
        data = json.loads(result)
        dependencies = data.get("rows", [])
        
        tables_used = set()
        columns_used = set()
        measures_used = set()
        
        for dep in dependencies:
            ref_table = dep.get("[@referenced_table]", "")
            ref_object = dep.get("[@referenced_object]", "")
            ref_type = dep.get("[@referenced_object_type]", "")
            
            if ref_table:
                tables_used.add(ref_table)
            
            if ref_type == "COLUMN" and ref_table and ref_object:
                columns_used.add(f"{ref_table}[{ref_object}]")
            elif ref_type == "MEASURE" and ref_table and ref_object:
                measures_used.add(f"{ref_table}[{ref_object}]")
        
        return {
            "status": "success",
            "dependencies": {
                "raw_dependencies": dependencies,
                "tables_used": list(tables_used),
                "columns_used": list(columns_used),
                "measures_used": list(measures_used)
            },
            "analysis": {
                "total_dependencies": len(dependencies),
                "unique_tables": len(tables_used),
                "unique_columns": len(columns_used),
                "unique_measures": len(measures_used)
            }
        }
        
    except Exception as e:
        return {"status": "error", "error": f"Failed to analyze query dependencies: {str(e)}"}


def expand_tables_through_relationships(
    initial_tables: set, 
    all_relationships: List[Dict], 
    table_mapping: Dict[str, str]
) -> set:
    expanded_tables = set(initial_tables)
    changed = True
    
    while changed:
        changed = False
        current_tables = expanded_tables.copy()
        
        for relationship in all_relationships:
            from_table_id = str(relationship.get("[@from_table_id]", ""))
            to_table_id = str(relationship.get("[@to_table_id]", ""))
            cross_filtering = relationship.get("[@cross_filtering_behavior]", "")
            is_active = relationship.get("[@is_active]", "") == "True"
            
            if not is_active:
                continue
                
            from_table = table_mapping.get(from_table_id, "")
            to_table = table_mapping.get(to_table_id, "")
            
            if not from_table or not to_table:
                continue
            
            if cross_filtering == "1":
                if from_table in current_tables and to_table not in expanded_tables:
                    expanded_tables.add(to_table)
                    changed = True
            elif cross_filtering == "2":
                if from_table in current_tables and to_table not in expanded_tables:
                    expanded_tables.add(to_table)
                    changed = True
                elif to_table in current_tables and from_table not in expanded_tables:
                    expanded_tables.add(from_table)
                    changed = True
    
    return expanded_tables


def get_limited_metadata(target_query: str, xmla_endpoint: str, dataset_name: str) -> Dict[str, Any]:
    try:
        dependencies_result = get_query_dependencies(target_query, xmla_endpoint, dataset_name)
        
        if dependencies_result["status"] != "success":
            return dependencies_result
        
        metadata_result = _execute_metadata_queries(xmla_endpoint, dataset_name)
        
        if metadata_result["status"] != "success":
            return metadata_result
        
        return _filter_metadata_by_dependencies(metadata_result, dependencies_result)
        
    except Exception as e:
        return {"status": "error", "error": f"Failed to get limited metadata: {str(e)}"}