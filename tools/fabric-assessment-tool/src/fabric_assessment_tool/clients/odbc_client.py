from typing import Any, Iterator, Optional

from mssql_python import connect

from ..assessment.synapse import CodeObjectCount, CodeObjectLines, TableStatistics


class OdbcClient:
    """ODBC client for connecting to Azure Synapse Analytics dedicated SQL pools."""

    def __init__(
        self, workspace_name: str, database: str, username: str, password: str
    ):
        """
        Initialize ODBC client with connection parameters.

        Args:
            workspace_name: The Synapse workspace name (e.g., 'myworkspace.sql.azuresynapse.net')
            user: SQL authentication username
            password: SQL authentication password
        """
        self.workspace_name = workspace_name
        self.database = database
        self.username = username
        self.password = password
        self._connection_string = self._build_connection_string()
        self._connection: Optional[Any] = None

    def _build_connection_string(self) -> str:
        """Build the ODBC connection string."""
        # Ensure workspace_name has the full domain if not provided
        if not self.workspace_name.endswith(".sql.azuresynapse.net"):
            server = f"{self.workspace_name}.sql.azuresynapse.net"
        else:
            server = self.workspace_name

        return (
            f"Server=tcp:{server},1433;"
            f";Database={self.database};"
            f"Uid={self.username};"
            f"Pwd={self.password};"
            f"Encrypt=yes;"
            f"TrustServerCertificate=no;"
        )

    def __enter__(self):
        """Enter context manager - open connection."""
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager - close connection."""
        self.close()
        return False

    def open(self) -> None:
        """Open the database connection."""
        if self._connection is None:
            self._connection = connect(self._connection_string)

    def close(self) -> None:
        """Close the database connection."""
        if self._connection is not None:
            try:
                self._connection.close()
            except Exception:
                pass  # Ignore errors on close
            finally:
                self._connection = None

    def _ensure_connection(self) -> Any:
        """Ensure connection is open and return it."""
        if self._connection is None:
            self.open()
        return self._connection

    def execute_query(self, query: str) -> Iterator[Any]:
        """
        Execute a SQL query and yield results row by row.

        Args:
            query: SQL query to execute

        Yields:
            Row objects from the query results
        """
        conn = self._ensure_connection()
        with conn.cursor() as cursor:
            cursor.execute(query)
            for row in cursor:
                yield row

    def check_table_statistics_dmv_exists(self) -> bool:
        """
        Check if the vTableSizes view exists in the master database.

        Returns:
            True if the view exists, False otherwise.
        """
        check_query = """
SELECT OBJECT_ID('dbo.vTableSizes', 'V')
        """

        conn = self._ensure_connection()
        with conn.cursor() as cursor:
            cursor.execute(check_query)
            result = cursor.fetchone()
            return result[0] is not None

    def create_table_statistics_dmv(self) -> None:
        """
        Create the vTableSizes view in the master database if it does not exist.

        Raises:
            Exception: If there is an error creating the view.
        """

        create_view_query = """
CREATE VIEW dbo.vTableSizes
AS
WITH base
AS
(
SELECT
 GETDATE()                                                             AS  [execution_time]
, DB_NAME()                                                            AS  [database_name]
, s.name                                                               AS  [schema_name]
, t.name                                                               AS  [table_name]
, QUOTENAME(s.name)+'.'+QUOTENAME(t.name)                              AS  [two_part_name]
, nt.[name]                                                            AS  [node_table_name]
, ROW_NUMBER() OVER(PARTITION BY nt.[name] ORDER BY (SELECT NULL))     AS  [node_table_name_seq]
, tp.[distribution_policy_desc]                                        AS  [distribution_policy_name]
, c.[name]                                                             AS  [distribution_column]
, nt.[distribution_id]                                                 AS  [distribution_id]
, i.[type]                                                             AS  [index_type]
, i.[type_desc]                                                        AS  [index_type_desc]
, nt.[pdw_node_id]                                                     AS  [pdw_node_id]
, pn.[type]                                                            AS  [pdw_node_type]
, pn.[name]                                                            AS  [pdw_node_name]
, di.name                                                              AS  [dist_name]
, di.position                                                          AS  [dist_position]
, nps.[partition_number]                                               AS  [partition_nmbr]
, nps.[reserved_page_count]                                            AS  [reserved_space_page_count]
, nps.[reserved_page_count] - nps.[used_page_count]                    AS  [unused_space_page_count]
, nps.[in_row_data_page_count]
    + nps.[row_overflow_used_page_count]
    + nps.[lob_used_page_count]                                        AS  [data_space_page_count]
, nps.[reserved_page_count]
 - (nps.[reserved_page_count] - nps.[used_page_count])
 - ([in_row_data_page_count]
         + [row_overflow_used_page_count]+[lob_used_page_count])       AS  [index_space_page_count]
, nps.[row_count]                                                      AS  [row_count]
from
    sys.schemas s
INNER JOIN sys.tables t
    ON s.[schema_id] = t.[schema_id]
INNER JOIN sys.indexes i
    ON  t.[object_id] = i.[object_id]
    AND i.[index_id] <= 1
INNER JOIN sys.pdw_table_distribution_properties tp
    ON t.[object_id] = tp.[object_id]
INNER JOIN sys.pdw_table_mappings tm
    ON t.[object_id] = tm.[object_id]
INNER JOIN sys.pdw_nodes_tables nt
    ON tm.[physical_name] = nt.[name]
INNER JOIN sys.dm_pdw_nodes pn
    ON  nt.[pdw_node_id] = pn.[pdw_node_id]
INNER JOIN sys.pdw_distributions di
    ON  nt.[distribution_id] = di.[distribution_id]
INNER JOIN sys.dm_pdw_nodes_db_partition_stats nps
    ON nt.[object_id] = nps.[object_id]
    AND nt.[pdw_node_id] = nps.[pdw_node_id]
    AND nt.[distribution_id] = nps.[distribution_id]
    AND i.[index_id] = nps.[index_id]
LEFT OUTER JOIN (select * from sys.pdw_column_distribution_properties where distribution_ordinal = 1) cdp
    ON t.[object_id] = cdp.[object_id]
LEFT OUTER JOIN sys.columns c
    ON cdp.[object_id] = c.[object_id]
    AND cdp.[column_id] = c.[column_id]
WHERE pn.[type] = 'COMPUTE'
)
, size
AS
(
SELECT
   [execution_time]
,  [database_name]
,  [schema_name]
,  [table_name]
,  [two_part_name]
,  [node_table_name]
,  [node_table_name_seq]
,  [distribution_policy_name]
,  [distribution_column]
,  [distribution_id]
,  [index_type]
,  [index_type_desc]
,  [pdw_node_id]
,  [pdw_node_type]
,  [pdw_node_name]
,  [dist_name]
,  [dist_position]
,  [partition_nmbr]
,  [reserved_space_page_count]
,  [unused_space_page_count]
,  [data_space_page_count]
,  [index_space_page_count]
,  [row_count]
,  ([reserved_space_page_count] * 8.0)                                 AS [reserved_space_KB]
,  ([reserved_space_page_count] * 8.0)/1000                            AS [reserved_space_MB]
,  ([reserved_space_page_count] * 8.0)/1000000                         AS [reserved_space_GB]
,  ([reserved_space_page_count] * 8.0)/1000000000                      AS [reserved_space_TB]
,  ([unused_space_page_count]   * 8.0)                                 AS [unused_space_KB]
,  ([unused_space_page_count]   * 8.0)/1000                            AS [unused_space_MB]
,  ([unused_space_page_count]   * 8.0)/1000000                         AS [unused_space_GB]
,  ([unused_space_page_count]   * 8.0)/1000000000                      AS [unused_space_TB]
,  ([data_space_page_count]     * 8.0)                                 AS [data_space_KB]
,  ([data_space_page_count]     * 8.0)/1000                            AS [data_space_MB]
,  ([data_space_page_count]     * 8.0)/1000000                         AS [data_space_GB]
,  ([data_space_page_count]     * 8.0)/1000000000                      AS [data_space_TB]
,  ([index_space_page_count]  * 8.0)                                   AS [index_space_KB]
,  ([index_space_page_count]  * 8.0)/1000                              AS [index_space_MB]
,  ([index_space_page_count]  * 8.0)/1000000                           AS [index_space_GB]
,  ([index_space_page_count]  * 8.0)/1000000000                        AS [index_space_TB]
FROM base
)
SELECT *
FROM size
        """

        conn = self._ensure_connection()
        # Save current autocommit state and set to True for DDL
        original_autocommit = conn.autocommit
        try:
            conn.autocommit = True
            with conn.cursor() as cursor:
                cursor.execute(create_view_query)
        finally:
            # Restore original autocommit state
            conn.autocommit = original_autocommit

    def get_table_statistics(self, database: str) -> Iterator[TableStatistics]:
        """
        Get table statistics from the vTableSizes view.

        Args:
            database: The database name to query

        Yields:
            TableStatistics objects with table size and distribution information
        """
        query = """
SELECT
    database_name
,   schema_name
,   table_name
,   distribution_policy_name
,   distribution_column
,   index_type_desc
,   COUNT(distinct partition_nmbr) as nbr_partitions
,   SUM(row_count)                 as table_row_count
,   SUM(reserved_space_GB)         as table_reserved_space_GB
,   SUM(data_space_GB)             as table_data_space_GB
,   SUM(index_space_GB)            as table_index_space_GB
,   SUM(unused_space_GB)           as table_unused_space_GB
FROM
    dbo.vTableSizes
GROUP BY
    database_name
,   schema_name
,   table_name
,   distribution_policy_name
,   distribution_column
,   index_type_desc
ORDER BY
    table_reserved_space_GB desc
"""

        for row in self.execute_query(query):
            yield TableStatistics(
                database_name=row.database_name,
                schema_name=row.schema_name,
                table_name=row.table_name,
                distribution_policy_name=row.distribution_policy_name,
                distribution_column=row.distribution_column,
                index_type_desc=row.index_type_desc,
                nbr_partitions=row.nbr_partitions,
                table_row_count=row.table_row_count,
                table_reserved_space_gb=row.table_reserved_space_GB,
                table_data_space_gb=row.table_data_space_GB,
                table_index_space_gb=row.table_index_space_GB,
                table_unused_space_gb=row.table_unused_space_GB,
            )

    def get_object_count(self, database: str) -> Iterator[CodeObjectCount]:

        query = """
SELECT 
    type_desc, count(*) AS count_objects
FROM SYS.OBJECTS
WHERE TYPE IN ( 'P','V','TR','FN')
GROUP BY TYPE_desc,type        
"""
        for row in self.execute_query(query):
            yield CodeObjectCount(
                type_description=row.type_desc, count=row.count_objects
            )

    def get_code_lines_statistics(self, database: str) -> Iterator[CodeObjectLines]:

        query = """
declare @lencount nchar(2)
set @lencount = char(0x0d) + char(0x0a);
select [Schema]=schema_name(p.schema_id), [ObjectName]=p.name
, Num_of_LineCode=(len(m.definition) -len(replace(m.definition, @lencount, ''))) /2,'Procedure' as Type
from sys.sql_modules m
inner join sys.procedures p on m.object_id = p.object_id
union all
select [Schema]=schema_name(p.schema_id), [ObjectName]=p.name
, Num_of_LineCode=(len(m.definition) -len(replace(m.definition, @lencount, ''))) /2,'Views' as Type
from sys.sql_modules m
inner join sys.views p on m.object_id = p.object_id
union all
select [Schema]=schema_name(p.schema_id), [ObjectName]=p.name
, Num_of_LineCode=(len(m.definition) -len(replace(m.definition, @lencount, ''))) /2,'Functions' as Type
from sys.sql_modules m inner join
sys.objects AS p   
    ON m.object_id = p.object_id   
    AND type = ('FN'); 
"""
        for row in self.execute_query(query):
            yield CodeObjectLines(
                schema_name=row.Schema,
                object_name=row.ObjectName,
                code_line_number=row.Num_of_LineCode,
                type_description=row.Type,
            )
