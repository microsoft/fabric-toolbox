-- =========================================================
-- Mirror_CCI_tables - script to Mirror CCI tables, this only works on Fabric SQL DB. 
-- (Only tested on Fabric SQL DB - SQLServer version is slightly different)
-- =========================================================
Create or alter proc [dbo].[Mirror_CCI_tables]
as
begin

SET NOCOUNT ON;

------------------------------------------------------------------------
-- CONFIG: change this value to the schema you want to replicate into
------------------------------------------------------------------------
DECLARE @ReplicaSchema SYSNAME = 'Mirroring';    -- <<<< change as needed
DECLARE @AuditTable SYSNAME = 'ReplicationAudit';
DECLARE @SourceDefaultSchema SYSNAME = 'dbo'; -- optional, used for SrcFull if you want default

-- pre-quoted forms (safe to use in dynamic SQL)
DECLARE @ReplicaSchemaQ NVARCHAR(128) = QUOTENAME(@ReplicaSchema);
DECLARE @AuditTableQ NVARCHAR(128)   = QUOTENAME(@AuditTable);

------------------------------------------------------------------------
-- Ensure the replica schema exists
------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = @ReplicaSchema)
BEGIN
    DECLARE @createSchemaSQL NVARCHAR(MAX) = N'CREATE SCHEMA ' + @ReplicaSchemaQ + N';';
    EXEC(@createSchemaSQL);
END

------------------------------------------------------------------------
-- Ensure audit table exists (in replica schema)
------------------------------------------------------------------------
IF OBJECT_ID(QUOTENAME(@ReplicaSchema) + '.' + QUOTENAME(@AuditTable), 'U') IS NULL
BEGIN
    DECLARE @createAuditSQL NVARCHAR(MAX) = N'
    CREATE TABLE ' + @ReplicaSchemaQ + N'.' + @AuditTableQ + N'(
        AuditID INT IDENTITY(1,1) PRIMARY KEY,
        TableName SYSNAME NOT NULL,
        RunStart DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        RunEnd DATETIME2 NULL,
        RowsInserted INT DEFAULT 0,
        RowsDeleted INT DEFAULT 0,
        Notes NVARCHAR(MAX) NULL
    );';
    EXEC(@createAuditSQL);
END

------------------------------------------------------------------------
-- Cursor: all tables with is_replicated = 0
------------------------------------------------------------------------
DECLARE @SchemaName SYSNAME, @TableName SYSNAME;

DECLARE table_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT s.name, t.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE t.is_replicated = 0;

OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @SchemaName, @TableName;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT '--------------------------------------------------';
    PRINT 'Processing: ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName);
    PRINT '--------------------------------------------------';

    -- dynamic object names (quoted)
    DECLARE @SrcFull NVARCHAR(400) = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName);
    DECLARE @TgtFull NVARCHAR(400) = @ReplicaSchemaQ + N'.' + QUOTENAME(@TableName);

    -- working variables
    DECLARE @ColsQuoted NVARCHAR(MAX), @ColsUnquoted NVARCHAR(MAX);
    DECLARE @OnClause NVARCHAR(MAX);
    DECLARE @HasIdentity BIT = 0;
    DECLARE @AuditID INT = 0;
    DECLARE @RowsInserted INT = 0;
    DECLARE @RowsDeleted INT = 0;
    DECLARE @tmpSQL NVARCHAR(MAX);

    ----------------------------------------------------------------
    -- Build column lists (exclude computed and rowversion/timestamp)
    ----------------------------------------------------------------
    SELECT
        @ColsQuoted   = STRING_AGG(QUOTENAME(c.name), ','),
        @ColsUnquoted = STRING_AGG(c.name, ',')
    FROM sys.columns c
    JOIN sys.types tt ON c.user_type_id = tt.user_type_id
    WHERE c.object_id = OBJECT_ID(@SrcFull)
      AND c.is_computed = 0
      AND tt.name NOT IN ('timestamp','rowversion');

    IF @ColsUnquoted IS NULL OR LEN(@ColsUnquoted) = 0
    BEGIN
        PRINT 'No usable columns for replication (all computed/timestamp). Skipping: ' + @SrcFull;
        GOTO _next_table;
    END

    -- detect identity presence
    SELECT @HasIdentity = MAX(CASE WHEN is_identity = 1 THEN 1 ELSE 0 END)
    FROM sys.columns
    WHERE object_id = OBJECT_ID(@SrcFull);

    ----------------------------------------------------------------
    -- Insert audit record and get AuditID (use sp_executesql to capture SCOPE_IDENTITY())
    ----------------------------------------------------------------
    DECLARE @insAuditSQL NVARCHAR(MAX) = N'
        INSERT INTO ' + @ReplicaSchemaQ + N'.' + @AuditTableQ + N' (TableName, RunStart)
        VALUES (@tbl, SYSUTCDATETIME());
        SELECT @out_id = SCOPE_IDENTITY();';

    EXEC sp_executesql
        @insAuditSQL,
        N'@tbl SYSNAME, @out_id INT OUTPUT',
        @tbl = @TableName,
        @out_id = @AuditID OUTPUT;

    ----------------------------------------------------------------
    -- If target doesn't exist -> create snapshot (CREATE TABLE + INSERT)
    ----------------------------------------------------------------
    IF OBJECT_ID(@TgtFull, 'U') IS NULL
    BEGIN
        PRINT 'Target does not exist; creating snapshot: ' + @TgtFull;

        -- Build CREATE TABLE statement from source column metadata (skip computed/timestamp)
        ;WITH coldef AS (
            SELECT c.column_id, c.name, tt.name AS typ,
                   c.max_length, c.precision, c.scale,
                   c.is_nullable, c.is_identity, c.is_computed
            FROM sys.columns c
            JOIN sys.types tt ON c.user_type_id = tt.user_type_id
            WHERE c.object_id = OBJECT_ID(@SrcFull)
           -- ORDER BY c.column_id
        )
        SELECT @tmpSQL = STRING_AGG(
            CASE
                WHEN is_computed = 1 OR typ IN('timestamp','rowversion') THEN NULL
                ELSE
                    QUOTENAME(name) + N' ' +
                    CASE
                        WHEN typ IN('varchar','char','varbinary') THEN typ + '(' + CASE WHEN max_length = -1 THEN 'MAX' ELSE CAST(max_length AS NVARCHAR(10)) END + ')'
                        WHEN typ IN('nvarchar','nchar') THEN typ + '(' + CASE WHEN max_length = -1 THEN 'MAX' ELSE CAST(max_length/2 AS NVARCHAR(10)) END + ')'
                        WHEN typ IN('decimal','numeric') THEN typ + '(' + CAST(precision AS NVARCHAR(10)) + ',' + CAST(scale AS NVARCHAR(10)) + ')'
                        WHEN typ IN('datetime2','time','datetimeoffset') THEN typ + '(' + CAST(scale AS NVARCHAR(10)) + ')'
                        ELSE typ
                    END
                    + CASE WHEN is_identity = 1 THEN ' IDENTITY(1,1)' ELSE '' END
                    + CASE WHEN is_nullable = 1 THEN ' NULL' ELSE ' NOT NULL' END
            END, N',')
        FROM coldef;

        IF @tmpSQL IS NULL
        BEGIN
            PRINT 'No createable columns found; skipping snapshot for ' + @SrcFull;
            GOTO _audit_update;
        END

        -- create table
        DECLARE @createTblSQL NVARCHAR(MAX) = N'CREATE TABLE ' + @TgtFull + N'(' + @tmpSQL + N');';
        EXEC sp_executesql @createTblSQL;

        -- do initial copy (preserve identity if present)
        IF @HasIdentity = 1
        BEGIN
            SET @tmpSQL = N'SET IDENTITY_INSERT ' + @TgtFull + N' ON; ' +
                          N'INSERT INTO ' + @TgtFull + N' (' + @ColsQuoted + N') SELECT ' + @ColsQuoted + N' FROM ' + @SrcFull + N'; ' +
                          N'SET IDENTITY_INSERT ' + @TgtFull + N' OFF;';
        END
        ELSE
        BEGIN
            SET @tmpSQL = N'INSERT INTO ' + @TgtFull + N' (' + @ColsQuoted + N') SELECT ' + @ColsQuoted + N' FROM ' + @SrcFull + N';';
        END

        EXEC sp_executesql @tmpSQL;

        -- get count inserted (capture via sp_executesql)
        DECLARE @cntInserted INT = 0;
        SET @tmpSQL = N'SELECT @cnt = COUNT(*) FROM ' + @TgtFull + N';';
        EXEC sp_executesql @tmpSQL, N'@cnt INT OUTPUT', @cnt = @cntInserted OUTPUT;
        SET @RowsInserted = ISNULL(@cntInserted, 0);

        GOTO _audit_update;
    END

    ----------------------------------------------------------------
    -- DELETE FIRST: remove rows present in target but not in source
    -- Build ON clause once (qualified names)
    ----------------------------------------------------------------
    SELECT @OnClause = STRING_AGG(N'T.' + QUOTENAME(c.name) + N' = D.' + QUOTENAME(c.name), N' AND ')
    FROM sys.columns c
    JOIN sys.types tt ON c.user_type_id = tt.user_type_id
    WHERE c.object_id = OBJECT_ID(@SrcFull)
      AND c.is_computed = 0
      AND tt.name NOT IN ('timestamp','rowversion');

    IF @OnClause IS NULL OR LEN(@OnClause) = 0
    BEGIN
        PRINT 'No columns to match on for delete; skipping deletes for ' + @SrcFull;
    END
    ELSE
    BEGIN
        SET @tmpSQL = N'
            DELETE T
            FROM ' + @TgtFull + N' T
            INNER JOIN (
                SELECT ' + @ColsUnquoted + N' FROM ' + @TgtFull + N'
                EXCEPT
                SELECT ' + @ColsUnquoted + N' FROM ' + @SrcFull + N'
            ) D
            ON ' + @OnClause + N';
            SELECT @del = @@ROWCOUNT;
        ';

        -- capture deleted count via OUTPUT param
        DECLARE @delCount INT = 0;
        EXEC sp_executesql
            @tmpSQL,
            N'@del INT OUTPUT',
            @del = @delCount OUTPUT;

        SET @RowsDeleted = ISNULL(@delCount, 0);
    END

    ----------------------------------------------------------------
    -- INSERT DELTAS: insert rows that are in source but not in target
    -- Capture inserted count via OUTPUT param
    ----------------------------------------------------------------
    IF @HasIdentity = 1
    BEGIN
        SET @tmpSQL = N'SET IDENTITY_INSERT ' + @TgtFull + N' ON; ' +
                      N'INSERT INTO ' + @TgtFull + N' (' + @ColsQuoted + N') ' +
                      N'SELECT ' + @ColsQuoted + N' FROM ' + @SrcFull + N' EXCEPT SELECT ' + @ColsQuoted + N' FROM ' + @TgtFull + N'; ' +
                      N'SELECT @ins = @@ROWCOUNT; ' +
                      N'SET IDENTITY_INSERT ' + @TgtFull + N' OFF;';
    END
    ELSE
    BEGIN
        SET @tmpSQL = N'INSERT INTO ' + @TgtFull + N' (' + @ColsQuoted + N') ' +
                      N'SELECT ' + @ColsQuoted + N' FROM ' + @SrcFull + N' EXCEPT SELECT ' + @ColsQuoted + N' FROM ' + @TgtFull + N'; ' +
                      N'SELECT @ins = @@ROWCOUNT;';
    END

    DECLARE @insCount INT = 0;
    EXEC sp_executesql
        @tmpSQL,
        N'@ins INT OUTPUT',
        @ins = @insCount OUTPUT;

    SET @RowsInserted = ISNULL(@insCount, 0);

_audit_update:
    ----------------------------------------------------------------
    -- Update audit row with counts
    ----------------------------------------------------------------
    DECLARE @updAuditSQL NVARCHAR(MAX) = N'
        UPDATE ' + @ReplicaSchemaQ + N'.' + @AuditTableQ + N'
        SET RunEnd = SYSUTCDATETIME(),
            RowsInserted = @ri,
            RowsDeleted  = @rd
        WHERE AuditID = @aid;';

    EXEC sp_executesql
        @updAuditSQL,
        N'@ri INT, @rd INT, @aid INT',
        @ri = @RowsInserted,
        @rd = @RowsDeleted,
        @aid = @AuditID;

_next_table:
    FETCH NEXT FROM table_cursor INTO @SchemaName, @TableName;
END

CLOSE table_cursor;
DEALLOCATE table_cursor;

PRINT 'All processing completed.';
end