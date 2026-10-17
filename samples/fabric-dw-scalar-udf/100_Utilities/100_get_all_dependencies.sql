-- ============================================================================
-- Scalar UDF Hands-On Lab: Utility 100 - Get All Dependencies
-- Purpose: List all dependencies between objects in the warehouse
-- ============================================================================

SELECT DISTINCT
    referencing_object_name = OBJECT_NAME(d.referencing_id),
    referenced_object_name = OBJECT_NAME(d.referenced_id), 
	OBJECTPROPERTY(d.referencing_id, 'IsScalarFunction') is_referencing_object_IsScalarFunction,
	OBJECTPROPERTY(d.referenced_id, 'IsScalarFunction') is_referenced_object_IsScalarFunction,
	OBJECTPROPERTY(d.referenced_id, 'IsTable') is_referenced_object_IsTable,
	d.referencing_id, d.referenced_id,
	d.is_schema_bound_reference
FROM 
    sys.sql_expression_dependencies AS d
WHERE OBJECTPROPERTY(d.referencing_id, 'IsScalarFunction') = 1
    AND (
        d.referenced_schema_name IS NULL
        OR d.referenced_schema_name <> 'queryinsights'
    );
