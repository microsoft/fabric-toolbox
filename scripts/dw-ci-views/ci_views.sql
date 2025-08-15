/*
-- show the views
exec create_views  1

-- create the views
exec create_views  2
*/
create or alter proc create_views 
@apply_views INT
AS
begin

    -- drop the temp table if it exists
    DROP TABLE IF EXISTS #temp_tbl 

    -- create table
    create table #temp_tbl 
    (  SchName varchar(50),
        tblName varchar(50),
        DDLScript varchar(8000),
        id_col int)

    -- insert into table
    insert into #temp_tbl 
    SELECT
    SchName,
    tblName,
    'CREATE OR ALTER  view [' + SchName + '].[vw_' + tblName + '] as SELECT  ' + STRING_AGG(colname + ' '+ 
    case coltype
    when 'varchar' then ' COLLATE Latin1_General_100_CI_AI_SC as ' + colname  
    else '' 
    end 
    , ', ') + ' from [' + SchName + '].[' + tblName + '];' AS DDLScript,  ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS [Sequence] 
    FROM (
    select tbl.object_id, convert(varchar, sc.name) SchName, convert(varchar, tbl.name) tblName , c.column_id colid,  convert(varchar,c.name) colname,  convert(varchar,t.name) as coltype,  convert(varchar,c.collation_name) collation_name
    from sys.columns c
        join sys.tables tbl on tbl.object_id=c.object_id
        join sys.types t on t.user_type_id = c.user_type_id
        inner join sys.schemas sc on  tbl.schema_id=sc.schema_id
        left join sys.default_constraints dc on c.default_object_id =dc.object_id and c.object_id =dc.parent_object_id) a
    GROUP BY SchName, tblName;

    if @apply_views = 1 or @apply_views = 2
    BEGIN
        SELECT * FROM #temp_tbl 
    END


    if @apply_views = 3 or @apply_views = 2
    BEGIN

        DECLARE
            @i INT = 1, 
            @t INT = (SELECT COUNT(*) FROM #temp_tbl) ,
            @sqlQuery varchar(8000)

        WHILE @i <= @t
        BEGIN
            
            SELECT @sqlQuery = DDLScript FROM #temp_tbl where [id_col] = @i
            exec(@sqlQuery )

            SET @i+=1;
        END  

    END

end


