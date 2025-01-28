--Declaring Variables

--11/6/2023 0:20:16 @F64
SELECT 'Job started', GETDATE()

DECLARE @StartTime datetime
DECLARE @EndTime datetime
DECLARE @TotalStartTime datetime
DECLARE @TotalEndTime datetime

SELECT @TotalStartTime=GETDATE();

--Ingest nation
SELECT @StartTime=GETDATE() 

COPY INTO nation from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/nation/'
WITH
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest nation elapsed time', DATEDIFF(ss,@StartTime,@EndTime)

--Ingest region
SELECT @StartTime=GETDATE() 

COPY INTO region from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/region/'
WITH
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest region elapsed time', DATEDIFF(ss,@StartTime,@EndTime)

--Ingest customer
SELECT @StartTime=GETDATE() 

COPY INTO customer from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/customer/'
WITH 
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest customer elapsed time', DATEDIFF(ss,@StartTime,@EndTime)


--Ingest supplier
SELECT @StartTime=GETDATE() 

COPY INTO supplier from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/supplier/'
WITH
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest supplier elapsed time', DATEDIFF(ss,@StartTime,@EndTime)

--Ingest part
SELECT @StartTime=GETDATE() 

COPY INTO part from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/part/'
WITH
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest part elapsed time', DATEDIFF(ss,@StartTime,@EndTime)

--Ingest partsupp
SELECT @StartTime=GETDATE() 

COPY INTO partsupp from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/partsupp/'
WITH
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest partsupp elapsed time', DATEDIFF(ss,@StartTime,@EndTime)

--Ingest orders
SELECT @StartTime=GETDATE() 

COPY INTO orders from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/orders/'
WITH
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest orders elapsed time', DATEDIFF(ss,@StartTime,@EndTime)

--Ingest lineitem
SELECT @StartTime=GETDATE() 

COPY INTO lineitem from 'https://<mystorage>.dfs.core.windows.net/tpch1tb/lineitem/'
WITH
(
    FILE_TYPE = 'CSV',
    CREDENTIAL=(IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
    ERRORFILE = 'https://<mystorage>.dfs.core.windows.net/tpch1tb/error_files',
	ERRORFILE_CREDENTIAL = (IDENTITY= 'Shared Access Signature', SECRET='<mySASkey>'),
	FIELDQUOTE = '"',
    FIELDTERMINATOR='|',
    ROWTERMINATOR='0x0A',
    ENCODING = 'UTF8',
    FIRSTROW = 1
);

SELECT @EndTime=GETDATE()
SELECT 'Ingest lineitem elapsed time', DATEDIFF(ss,@StartTime,@EndTime)

SELECT @TotalEndTime=GETDATE()
SELECT 'TPCH Ingestion Total elapsed time', DATEDIFF(ss,@TotalStartTime,@TotalEndTime)

SELECT 'Job Ended', GETDATE()