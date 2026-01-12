
create or alter proc table_to_view
  @InputDatabase  NVARCHAR(255),
  @apply_views INT
AS
begin
/*
@apply_views
			0- just show logging
			1- create views AND show logging 
			2- just create the views
*/

	declare @dynamTempTable  varchar(max)
    -- drop the temp table if it exists
    DROP TABLE IF EXISTS #temp_tbl 

    -- create table
    create table #temp_tbl 
    (  SchName varchar(50),
        tblName varchar(50),
        DDLScript varchar(8000),
        id_col int)

    -- insert into table
	SET @dynamTempTable = N'
	INSERT INTO #temp_tbl
	SELECT
		SchName,
		tblName,
		''CREATE OR ALTER VIEW ['' + SchName + ''].['' + tblName + ''] AS SELECT '' 
			+ STRING_AGG(colname + '' '', '', '') 
			+ '' FROM   ' + QUOTENAME(@InputDatabase) + N'.
			['' + SchName + ''].['' + tblName + ''];'' AS DDLScript,
		ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS [Sequence]
	FROM (
		SELECT 
			tbl.object_id,
			CONVERT(VARCHAR, sc.name) AS SchName,
			CONVERT(VARCHAR, tbl.name) AS tblName,
			c.column_id AS colid,
			CONVERT(VARCHAR, c.name) AS colname,
			CONVERT(VARCHAR, t.name) AS coltype,
			CONVERT(VARCHAR, c.collation_name) AS collation_name
		FROM ' + QUOTENAME(@InputDatabase) + N'.sys.columns c
		JOIN ' + QUOTENAME(@InputDatabase) + N'.sys.tables tbl ON tbl.object_id = c.object_id
		JOIN ' + QUOTENAME(@InputDatabase) + N'.sys.types t ON t.user_type_id = c.user_type_id
		INNER JOIN ' + QUOTENAME(@InputDatabase) + N'.sys.schemas sc ON tbl.schema_id = sc.schema_id
		LEFT JOIN ' + QUOTENAME(@InputDatabase) + N'.sys.default_constraints dc ON c.default_object_id = dc.object_id 
			AND c.object_id = dc.parent_object_id
	) a
	GROUP BY SchName, tblName;
	';

	-- Execute the dynamic SQL
	exec(@dynamTempTable);

    if @apply_views = 0  or  @apply_views = 1
    BEGIN
        print (@dynamTempTable)
		SELECT * FROM #temp_tbl 
    END


    if @apply_views = 1 or @apply_views = 2
    BEGIN

        DECLARE
            @i INT = 1, 
            @t INT = (SELECT COUNT(*) FROM #temp_tbl) ,
            @sqlQuery varchar(max)

        WHILE @i <= @t
        BEGIN
            
            SELECT @sqlQuery = DDLScript FROM #temp_tbl where [id_col] = @i
            print('---------------------------------------------------------------------')
			print (@sqlQuery)
			exec(@sqlQuery )

            SET @i+=1;
        END  

    END

end

