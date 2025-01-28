--Copy a system view into a table
--This example is for sys.tables. Table names and the desired columns/data types should be updated
declare @list varchar(max)
declare @sql nvarchar(max)
drop table if exists sys_tables
create table sys_tables (object_id bigint, tablename varchar(128))
 
SELECT @list = STRING_AGG('(' + CAST([object_id] AS VARCHAR(20)) + ', ''' + CAST([name] AS VARCHAR(128)) + ''')', ',') FROM sys.tables
SET @sql = 'INSERT INTO sys_tables (object_id, tablename) VALUES ' + @list
--print @sql
exec sp_executesql @sql
 
select * from sys_tables