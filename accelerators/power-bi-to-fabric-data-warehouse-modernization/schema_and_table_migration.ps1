############################################ RUN SCRIPT TO BEGIN INPUTS

# Define the datamart connection parameters
$datamartServerAddress = Read-Host("Please provide your datamart server address ")
$datamartDatabaseName = Read-Host("`nPleas provide your datamart name ")

# Define the warehouse connection parameters
$warehouseServerAddress = Read-Host("`nPlease provide your datawarehouse server address ")
$warehouseDatabaseName = Read-Host("`nPlease provide your datawarehouse name ")

# Define the schema you want to create in the warehouse
do {
    $schemaName = Read-Host("`nPlease provide the name of a new schema you want created in the warehouse ")
    if ($schemaName -match "^(?i)dbo$") {
        Write-Host "The name 'dbo' is not recommended. Please choose a different name."
    }
} while ($schemaName -match "^(?i)dbo$")

# Define the tenant id you're logging into
$tenantId = Read-Host("`nPlease provide your tenant id ")

############################################ CHECK AND INSTALL MODULES

# Install the necessary modules if not already installed
if (-not (Get-Module -ListAvailable -Name Az.Accounts)) {
    Install-Module -Name Az.Accounts -AllowClobber -Force
    Import-Module -Name Az.Accounts
}
if (-not (Get-Module -ListAvailable -Name SqlServer)) {
    Install-Module -Name SqlServer -AllowClobber -Force
    Import-Module -Name SqlServer
}

############################################ BEGIN MIGRATION

# Login with your Entra ID account
Connect-AzAccount -TenantId $tenantId

# Get the access token for the Azure SQL Database
$accessToken = (Get-AzAccessToken -ResourceUrl 'https://database.windows.net/').Token

# Define the SQL query to generate the schema and table creation script
$sqlQuery = @"
DECLARE @sql VARCHAR(MAX) = '',
        @schema VARCHAR(MAX) = '$schemaName';

SELECT @sql = @sql + 'CREATE TABLE ['  + @schema + '].[' + TABLE_NAME + '] (' + CHAR(13) + CHAR(10) +
    STRING_AGG(
        '[' + cast(COLUMN_NAME as varchar(max)) + '] ' + 
        CASE 
            WHEN DATA_TYPE = 'nvarchar' THEN 'varchar'
            WHEN DATA_TYPE = 'nchar' THEN 'char'
            WHEN DATA_TYPE = 'time' THEN 'TIME (6)'
            WHEN DATA_TYPE = 'money' then 'DECIMAL (19,4)'
            WHEN DATA_TYPE IN ('datetime', 'datetime2', 'smalldatetime', 'datetime2') THEN 'DATETIME2 (6)'
            WHEN DATA_TYPE IN ('text', 'ntext') THEN 'varchar(8000)'
            ELSE DATA_TYPE
        END +
        CASE
            WHEN DATA_TYPE IN ('float', 'money', 'text', 'ntext') THEN ''
            WHEN DATA_TYPE = 'nvarchar' AND CHARACTER_MAXIMUM_LENGTH = -1 THEN '(MAX)'
            WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL AND DATA_TYPE NOT IN ('bigint', 'datetime', 'date', 'time', 'datetime2', 'smalldatetime') THEN '(' + CAST(CHARACTER_MAXIMUM_LENGTH AS VARCHAR) + ')'
            WHEN NUMERIC_PRECISION IS NOT NULL AND DATA_TYPE NOT IN ('bigint') THEN '(' + CAST(NUMERIC_PRECISION AS VARCHAR) + ',' + CAST(NUMERIC_SCALE AS VARCHAR) + ')'
            ELSE ''
        END, 
        ',' + CHAR(13) + CHAR(10)
    ) + CHAR(13) + CHAR(10) + ');' + CHAR(13) + CHAR(10)
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'model'
GROUP BY TABLE_NAME;

SELECT 'CREATE SCHEMA [' + @schema + '];
GO
' + @sql;
"@

# Generate the T-SQL command for schema and table creation from the existing datamart
try {
    $createSchema = Invoke-Sqlcmd -ServerInstance $datamartServerAddress -Database $datamartDatabaseName -AccessToken $accessToken -Query $sqlQuery -MaxCharLength 65535
} catch {
    Write-Error "Failed to generate schema creation script: $_"
}

# Create a new schema and tables in the fabric data warehouse
try {
    Invoke-Sqlcmd -ServerInstance $warehouseServerAddress -Database $warehouseDatabaseName -AccessToken $accessToken -Query $createSchema[0]
    Write-Output "Schema and tables created successfully in the fabric warehouse."
} catch {
    Write-Error "Failed to create schema and tables in the fabric warehouse: $_"
}
