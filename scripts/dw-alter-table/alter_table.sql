


create proc alter_table @tablename varchar(128), @colname varchar(128), @newcoltype varchar(128)
as
begin
/*
@tablename The name of the table
@colname The name of the column
@newcoltype The new data type of the column

example: 
exec alter_table 'demo','c','int'
*/

	DECLARE @tempcolname varchar(128);
	DECLARE @temptablename varchar(128);

	SET @tempcolname = @colname + '_tmp';
	SET @temptablename = @tablename + '_tmp'

	DECLARE @sSQlCreate varchar(8000);
	DECLARE @sSQlCreateNew varchar(8000);
	DECLARE @sSQldrop varchar(8000);
	DECLARE @ColumnList NVARCHAR(MAX) = '';

	SELECT @ColumnList = STRING_AGG(QUOTENAME(COLUMN_NAME), ', ') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tablename  and COLUMN_NAME != @colname;

	SET @sSQlCreate = 'select ' + @ColumnList + ', cast(' + @colname + '  as ' + @newcoltype + ') as ' + @colname + ' into ' + @temptablename + ' from ' + @tablename + ';'

	SET @sSQldrop = 'drop table  ' + @tablename + '_old ;'

	exec(@sSQlCreate)

	EXEC sp_rename 'demo', 'demo_old';

	EXEC sp_rename 'demo_tmp', 'demo';

	exec(@sSQldrop)

END

