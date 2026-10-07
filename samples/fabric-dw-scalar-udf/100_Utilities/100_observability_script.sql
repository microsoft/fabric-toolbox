-- Utility 100: Shape flags are heuristic. is_inlineable and inline_eligibility_mask are authoritative.
-- Filter the ScalarUDFs CTE by schema or function name when running against a large database.

IF OBJECT_ID('tempdb..#BuiltInFunctions') IS NOT NULL
    DROP TABLE #BuiltInFunctions;

CREATE TABLE #BuiltInFunctions (
    FunctionName VARCHAR(255) COLLATE DATABASE_DEFAULT,
    IsDeterministic BIT
);

INSERT INTO #BuiltInFunctions (FunctionName, IsDeterministic)
VALUES 
('ABS', 1), ('ACOS', 1), ('ASCII', 1), ('ASIN', 1), ('ATAN', 1), ('ATN2', 1), ('AVG', 1), ('CEILING', 1), ('CHARINDEX', 1), ('COALESCE', 1),
('COS', 1), ('COT', 1), ('COUNT', 1), ('DEGREES', 1), ('EXP', 1), ('FLOOR', 1), ('ISNULL', 1), ('LEFT', 1), ('LEN', 1),
('LOG', 1), ('LOWER', 1), ('LTRIM', 1), ('MAX', 1), ('MIN', 1), ('PATINDEX', 1), ('PI', 1), ('POWER', 1), ('RADIANS', 1), 
('REPLACE', 1), ('REPLICATE', 1), ('REVERSE', 1), ('RIGHT', 1), ('ROUND', 1), ('RTRIM', 1), ('SIGN', 1), ('SIN', 1), ('SQRT', 1),
('STR', 1), ('STUFF', 1), ('SUBSTRING', 1), ('SUM', 1), ('TAN', 1), ('UPPER', 1), 
('RAND', 0),('NEWID', 0),('GETDATE', 0),('CURRENT_TIMESTAMP', 0),('@@ROWCOUNT', 0),('SYSDATETIME', 0),('CURRENT_USER', 0),
('SESSION_USER', 0), ('USER_NAME', 0),('SYSTIMESTAMP', 0),('GETUTCDATE', 0),('CURRENT_TIME', 0),('CURRENT_DATE', 0),
('SESSION_CONTEXT', 0),('FORMATMESSAGE', 0)
;

;WITH ScalarUDFs AS (
    SELECT 
        o.object_id,
        s.name AS SchemaName,
        o.name AS FunctionName,
        UPPER(s.name) AS SchemaNameUpper,
        UPPER(o.name) AS FunctionNameUpper,
        definition_cleansed as FunctionDefinition,
        TRIM(CASE
            WHEN CHARINDEX('AS', definition_cleansed) > 0
                 AND CHARINDEX('BEGIN', definition_cleansed) > CHARINDEX('AS', definition_cleansed)
            THEN LTRIM(RTRIM(
                SUBSTRING(
                    definition_cleansed,
                    CHARINDEX('BEGIN', definition_cleansed) + LEN('BEGIN'),
                    LEN(definition_cleansed) - CHARINDEX('BEGIN', definition_cleansed) + 1
                )
            ))
            ELSE 'Function body could not be determined'
        END) AS FunctionBody,
        o.type AS object_type,
        r.FUNCTION_TYPE, 
        m.is_inlineable,
        m.inline_eligibility_mask,
        o.create_date,
        o.modify_date
    FROM 
        sys.objects o
    JOIN 
        (SELECT 
			REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(UPPER(definition))),
				CHAR(9), ''),
                CHAR(10), ''),
                CHAR(13), '')
			 as definition_cleansed, 
			object_id, 
            is_inlineable,
            -- inline_eligibility_mask (sys.sql_modules) per CREATE FUNCTION docs:
            --   0 = not inlineable
            --   1 = eligible for Scalar UDF inlining
            --   2 = eligible for inlining via Expression Block
            --   3 = eligible for either technique
            inline_eligibility_mask
        FROM sys.sql_modules
			) m ON o.object_id = m.object_id
    JOIN 
        sys.schemas s ON o.schema_id = s.schema_id
    JOIN (
        SELECT 
            object_id,
            CASE 
                WHEN OBJECTPROPERTY(object_id, 'IsTableFunction') = 1 THEN 'Table-Valued'
                WHEN OBJECTPROPERTY(object_id, 'IsScalarFunction') = 1 THEN 'Scalar'
                ELSE 'Unknown'
            END AS FUNCTION_TYPE
        FROM 
            sys.objects 
        WHERE 
            type = 'FN'
    ) r ON r.object_id = o.object_id
    WHERE 
        o.type = 'FN'
),
AllFunctions AS (
    SELECT 
        u.object_id,
        u.SchemaName, 
        u.FunctionName, 
        u.FunctionDefinition,
		u.FunctionBody,
        u.object_type,
        u.FUNCTION_TYPE,
        u.is_inlineable,
        u.inline_eligibility_mask,
        u.create_date,
        u.modify_date,
        CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM sys.tables t 
                WHERE u.FunctionBody LIKE '%' + UPPER(t.name) + '%' COLLATE DATABASE_DEFAULT
            ) THEN 1 
            ELSE 0 
        END as has_table_access,
		CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM ScalarUDFs u2 
                WHERE u.object_id = u2.object_id
                      AND (
                          LEN(REPLACE(REPLACE(u.FunctionBody, '--RETURN', ''), '@RETURN', '')) 
                          - LEN(REPLACE(REPLACE(REPLACE(u.FunctionBody, '--RETURN', ''), '@RETURN', ''), 'RETURN', ''))
                      ) / LEN('RETURN') > 1
            ) THEN 1 ELSE 0 
        END as has_multireturn,
        CASE WHEN u.FunctionBody LIKE '%DECLARE%' THEN 1 ELSE 0 END as has_declare,
        CASE WHEN u.FunctionBody LIKE '%WHILE%' THEN 1 ELSE 0 END as has_while_loop, 
        CASE WHEN u.FunctionBody LIKE '%IF%' THEN 1 ELSE 0 END as has_if,
        CASE WHEN (LEN(u.FunctionBody) - LEN(REPLACE(u.FunctionBody, 'BEGIN', ''))) / LEN('BEGIN') >= 2 THEN 1 ELSE 0 END as has_multibegin,
		CASE WHEN u.FunctionBody LIKE '%CASE WHEN%' THEN 1 ELSE 0 END as has_casewhen,
        CASE WHEN u.FunctionBody LIKE '%BREAK%' THEN 1 ELSE 0 END as has_break, 
        CASE WHEN u.FunctionBody LIKE '%CONTINUE%' THEN 1 ELSE 0 END as has_continue, 
        CASE WHEN u.FunctionBody LIKE '%CURSOR%' THEN 1 ELSE 0 END as has_cursor, 
        CASE WHEN u.FunctionBody LIKE '%CATCH%' THEN 1 ELSE 0 END as has_try_catch, 
        CASE WHEN u.FunctionBody LIKE '%RAISERROR%' OR u.FunctionBody LIKE '%THROW%' THEN 1 ELSE 0 END as has_raiseerror,
        CASE WHEN u.FunctionBody LIKE '%@@ROWCOUNT%' THEN 1 ELSE 0 END as has_rowcount,

        CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM ScalarUDFs u2 
                WHERE u.FunctionBody LIKE '%' + u2.SchemaNameUpper + '%' + '.' + '%' + u2.FunctionNameUpper + '%' COLLATE DATABASE_DEFAULT
                  AND u.object_id = u2.object_id
            ) THEN 1 ELSE 0 
        END as has_recursive_call,

        CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM ScalarUDFs u2 
                WHERE u.FunctionBody LIKE '%' + u2.SchemaNameUpper + '%' + '.' + '%' + u2.FunctionNameUpper + '%' COLLATE DATABASE_DEFAULT
                  AND u.object_id <> u2.object_id
            ) THEN 1 ELSE 0 
        END as has_nested_call,
        CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM #BuiltInFunctions b 
                WHERE u.FunctionBody LIKE '%' + b.FunctionName + '%' COLLATE DATABASE_DEFAULT
                  AND b.IsDeterministic = 0
            ) THEN 1  ELSE 0 
        END as has_nondeterministic_builtin_call,
        CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM #BuiltInFunctions b 
                WHERE u.FunctionBody LIKE '%' + b.FunctionName + '%' COLLATE DATABASE_DEFAULT
                  AND b.IsDeterministic = 1
            ) THEN 1 ELSE 0 
        END as has_deterministic_builtin_call

    FROM 
        ScalarUDFs u
)

-- NOTE: FunctionDefinition + FunctionBody return the full (cleansed) source of
-- every function. Drop them from the SELECT list if you only need the flags.
SELECT *
FROM AllFunctions a
WHERE 1=1
--and is_inlineable=0
--and has_while_loop=1 
--and has_declare=0
--and has_break=1
--and a.FunctionName like '%MyName%'
