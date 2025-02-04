--This SP will kill queries with the criteria provided. 
--If you do not pass a particular parameter it will ignore that as a criteria
--You must provide at least 1 criteria
IF OBJECT_ID('[dbo].[sp_KillQueries]') IS NOT NULL
BEGIN
    DROP PROCEDURE [dbo].[sp_KillQueries]
END
GO

CREATE PROCEDURE [dbo].[sp_KillQueries]
    @database_name VARCHAR(50), --without database name it looks across all WH/LH endpoints
    @login_name VARCHAR(50), 
    @query_text VARCHAR(100), --has this text snippet anywhere in the first 4k characters
    @elapsed_time_ms bigint,
    @command_type varchar(50), --type of command is SELECT,INSERT, etc
    @program_name VARCHAR(50), --program connected that issued query
    @query_hash varchar(50) --can use query hash if it's a known query. Case sensititivy, variables, or values may change hash

AS
BEGIN
    SET NOCOUNT ON;

    --fail if you don't pass any parameters (excluding database_name)
    IF (@login_name IS NULL 
        AND @query_text IS NULL
        AND @elapsed_time_ms IS NULL
        AND @command_type IS NULL
        AND @program_name IS NULL
        AND @query_hash IS NULL

        )
    BEGIN
        RAISERROR('All parameters cannot be null', 16, 1);
        RETURN;
    END

    DECLARE @kill_statement NVARCHAR(100);

    SELECT @kill_statement = STRING_AGG('KILL ' + CAST(r.session_id AS VARCHAR(10)), ';')
    FROM sys.dm_exec_requests r
    CROSS APPLY sys.[dm_exec_sql_text](r.[sql_handle]) t  
    JOIN sys.dm_exec_sessions s
        ON r.session_id = s.session_id
    JOIN sys.dm_exec_connections c
        ON s.session_id = c.session_id
    JOIN sys.databases d
	    ON d.database_id = r.database_id
    WHERE r.session_id <> @@SPID
    AND s.program_name NOT IN ('QueryInsights','DMS')
    AND (@database_name IS NULL OR d.name = @database_name)
    AND (@login_name IS NULL OR s.login_name = @login_name)
    AND (@query_text IS NULL OR t.text like '%' + @query_text + '%') --technically this returns if the parent batch has the text so need to fix
    AND (@elapsed_time_ms IS NULL OR r.total_elapsed_time > @elapsed_time_ms)
    AND (@command_type IS NULL OR r.command like '%' + @command_type + '%')
    AND (@program_name IS NULL OR s.program_name like '%' + @program_name + '%')
    AND (@query_hash IS NULL OR r.query_hash like '%' + @query_hash + '%')
    ;

    PRINT @kill_statement
    EXEC sp_executesql @kill_statement;
    
END;
