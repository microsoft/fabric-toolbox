import datetime as dt
import re
import struct
from contextlib import contextmanager
from typing import Any

import agate
import dbt_common.exceptions
from dbt_common.clients.agate_helper import empty_table

from dbt.adapters.contracts.connection import AdapterResponse, Connection, ConnectionState
from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabric.base_connection_manager import BaseFabricConnectionManager
from dbt.adapters.fabric.fabric_credentials import FabricCredentials

logger = AdapterLogger("fabric")

# https://github.com/microsoft/mssql-python/wiki/Data-Type-Conversion
datatypes = {
    "str": "varchar",
    "uuid.UUID": "uniqueidentifier",
    "uuid": "uniqueidentifier",
    "float": "bigint",
    "int": "int",
    "bytes": "varbinary",
    "bytearray": "varbinary",
    "bool": "bit",
    "datetime.date": "date",
    "datetime.datetime": "datetime2(6)",
    "datetime.time": "time",
    "decimal.Decimal": "decimal",
}


def bool_to_connection_string_arg(key: str, value: bool) -> str:
    """
    Convert a boolean to a connection string argument.

    Parameters
    ----------
    key : str
        The key to use in the connection string.
    value : bool
        The boolean to convert.

    Returns
    -------
    out : str
        The connection string argument.
    """
    return f"{key}={'Yes' if value else 'No'}"


def byte_array_to_datetime(value: bytes) -> dt.datetime:
    """
    Converts a DATETIMEOFFSET byte array to a timezone-aware datetime object

    Parameters
    ----------
    value : buffer
        A binary value conforming to SQL_SS_TIMESTAMPOFFSET_STRUCT

    Returns
    -------
    out : datetime

    Source
    ------
    SQL_SS_TIMESTAMPOFFSET datatype and SQL_SS_TIMESTAMPOFFSET_STRUCT layout:
    https://learn.microsoft.com/sql/relational-databases/native-client-odbc-date-time/data-type-support-for-odbc-date-and-time-improvements
    """
    # unpack 20 bytes of data into a tuple of 9 values
    tup = struct.unpack("<6hI2h", value)

    # construct a datetime object
    return dt.datetime(
        year=tup[0],
        month=tup[1],
        day=tup[2],
        hour=tup[3],
        minute=tup[4],
        second=tup[5],
        microsecond=tup[6] // 1000,  # https://bugs.python.org/issue15443
        tzinfo=dt.timezone(dt.timedelta(hours=tup[7], minutes=tup[8])),
    )


class FabricConnectionManager(BaseFabricConnectionManager):
    TYPE = "fabric"
    _host: str | None = None

    @contextmanager
    def exception_handler(self, sql):
        import mssql_python

        try:
            yield

        except mssql_python.DatabaseError as e:
            logger.debug(f"Database error: {str(e)}")

            try:
                # attempt to release the connection
                self.release()
            except mssql_python.Error:
                logger.debug("Failed to release connection!")

            raise dbt_common.exceptions.DbtDatabaseError(str(e).strip()) from e

        except Exception as e:
            logger.debug(f"Error running SQL: {sql}")
            logger.debug("Rolling back transaction.")
            self.release()
            if isinstance(e, dbt_common.exceptions.DbtRuntimeError):
                # during a sql query, an internal to dbt exception was raised.
                # this sounds a lot like a signal handler and probably has
                # useful information, so raise it without modification.
                raise

            raise dbt_common.exceptions.DbtRuntimeError(e) from e

    @classmethod
    def get_host(cls, credentials: FabricCredentials) -> str:
        """Resolve the SQL endpoint hostname from config or via the Fabric API.

        Checks ``credentials.host`` first, then falls back to querying the
        Fabric API using the configured workspace.

        Args:
            credentials: Fabric connection credentials.

        Raises:
            DbtConfigError: If neither host nor workspace is configured.
        """
        if cls._host is None:
            if credentials.host:
                cls._host = credentials.host
            elif credentials.workspace_id or credentials.workspace_name:
                api = cls.get_fabric_api_client(credentials)
                cls._host = api.get_warehouse_connection_string()
            else:
                raise dbt_common.exceptions.DbtConfigError(
                    "Either host or workspace_id must be provided."
                )
        assert cls._host is not None
        return cls._host

    @classmethod
    def open(cls, connection: Connection) -> Connection:
        import mssql_python

        if connection.state == ConnectionState.OPEN:
            logger.debug("Connection is already open, skipping open.")
            return connection

        assert isinstance(connection.credentials, FabricCredentials)
        credentials: FabricCredentials = connection.credentials

        con_str = [f"Server={cls.get_host(credentials)}"]

        con_str.append(f"Database={credentials.database}")

        assert credentials.authentication is not None

        if "ActiveDirectory" in credentials.authentication:
            con_str.append(f"Authentication={credentials.authentication}")
        if credentials.authentication == "ActiveDirectoryPassword":
            con_str.append(f"UID={{{credentials.UID}}}")
            con_str.append(f"PWD={{{credentials.PWD}}}")
        if credentials.authentication == "ActiveDirectoryServicePrincipal":
            con_str.append(f"UID={{{credentials.client_id}}}")
            con_str.append(f"PWD={{{credentials.client_secret}}}")
            con_str.append(f"Authority Id={{{credentials.tenant_id}}}")

        # https://docs.microsoft.com/en-us/sql/relational-databases/native-client/features/using-encryption-without-validation?view=sql-server-ver15
        assert credentials.encrypt is not None
        assert credentials.trust_cert is not None

        con_str.append(bool_to_connection_string_arg("Encrypt", credentials.encrypt))
        con_str.append(
            bool_to_connection_string_arg("TrustServerCertificate", credentials.trust_cert)
        )

        try:
            con_str.append(f"ConnectRetryCount={credentials.retries}")
            con_str.append("ConnectRetryInterval=10")

        except Exception as e:
            logger.debug(
                "Retry count should be a integer value. "
                "Skipping retries in the connection string.",
                str(e),
            )

        con_str_concat = ";".join(con_str)

        index = []
        for i, elem in enumerate(con_str):
            if "pwd=" in elem.lower():
                index.append(i)

        if len(index) != 0:
            con_str[index[0]] = "PWD=***"

        con_str_display = ";".join(con_str)

        retryable_exceptions = [
            mssql_python.InternalError,  # not used according to docs, but defined in PEP-249
            mssql_python.OperationalError,
        ]

        def connect():
            logger.debug(f"Using connection string: {con_str_display}")
            attrs_before = cls.get_fabric_token_provider(credentials).get_sql_attrs_before()

            handle = mssql_python.connect(
                con_str_concat,
                attrs_before=attrs_before,
                autocommit=True,
                timeout=credentials.login_timeout,
            )
            handle.timeout = credentials.query_timeout
            logger.debug(f"Connected to db: {credentials.database}")

            # convert DATETIMEOFFSET binary structures to datetime ojbects
            # https://github.com/mkleehammer/pyodbc/issues/134#issuecomment-281739794
            handle.add_output_converter(-155, byte_array_to_datetime)

            # Cap how long a statement waits on a schema lock before
            # bailing with error 1222 ("Lock request time out period
            # exceeded"). The Fabric Spark→DW connector leaves idle JDBC
            # sessions holding Sch-S on the target table after a Python
            # model write (#238 / #271). Without this cap, a follow-up
            # DDL stalls until query_timeout (default 300s). With the cap
            # the DDL fails fast enough to be visible to the user, who
            # can `dbt build --retry` (or wait for the Spark idle-reap
            # window to elapse) instead of hanging. The default of 30s
            # leaves room for the DW to detect closed TCP connections
            # after a python-model Spark application terminates; profiles
            # can override via the `lock_timeout` credential. Setting
            # lock_timeout to 0 skips the SET entirely, leaving SQL
            # Server's default of -1 (wait indefinitely) in place.
            if credentials.lock_timeout > 0:
                cursor = handle.cursor()
                try:
                    cursor.execute(f"SET LOCK_TIMEOUT {credentials.lock_timeout}")
                finally:
                    cursor.close()

            return handle

        return cls.retry_connection(
            connection,
            connect=connect,
            logger=logger,
            retry_limit=credentials.retries,
            retryable_exceptions=retryable_exceptions,
        )

    def cancel(self, connection: Connection):
        logger.debug("Cancel not supported for Fabric adapter.")

    @classmethod
    def get_response(cls, cursor: Any) -> AdapterResponse:
        messages_to_add = []
        query_id = None
        if cursor.messages:
            for msg in cursor.messages:
                marker = "statement id:"
                pos = msg[1].lower().find(marker)

                if pos != -1:
                    sub = msg[1][pos + len(marker) :]
                    m = re.search(r"\{([^{}]+)\}", sub)
                    if m:
                        query_id = m.group(1)
                elif "changed database context" in msg[1].lower():
                    pass
                else:
                    messages_to_add.append(msg[1])
        message = "\n".join(messages_to_add)
        if not message:
            message = "OK"
        return AdapterResponse(
            _message=message,
            rows_affected=cursor.rowcount,
            query_id=query_id,
        )

    @classmethod
    def data_type_code_to_name(cls, type_code: int | str) -> str:
        """Map an mssql-python type code to its SQL Server data type name.

        Args:
            type_code: A type code from the cursor's ``description`` attribute,
                in the format ``<class 'python_type_name'>``.
        """
        data_type = str(type_code)[str(type_code).index("'") + 1 : str(type_code).rindex("'")]
        return datatypes[data_type]

    def execute(
        self, sql: str, auto_begin: bool = True, fetch: bool = False, limit: int | None = None
    ) -> tuple[AdapterResponse, agate.Table]:
        sql = self._add_query_comment(sql)
        _, cursor = self.add_query(sql, auto_begin)
        if fetch:
            # Get the result of the first non-empty result set (if any)
            while cursor.description is None:
                logger.debug("Skipping empty result set...")
                if not cursor.nextset():
                    break
            table = self.get_result_from_cursor(cursor, limit)
        else:
            table = empty_table()
        # Step through all result sets so we process all errors
        while cursor.nextset():
            logger.debug("Stepping through remaining result sets...")
            pass
        response = self.get_response(cursor)
        return response, table

    def add_query(
        self,
        sql: str,
        auto_begin: bool = True,
        bindings: Any | None = None,
        abridge_sql_log: bool = False,
        retryable_exceptions: tuple[type[Exception], ...] | None = None,
        retry_limit: int = 3,
    ):
        import mssql_python

        if retryable_exceptions is None:
            retryable_exceptions = (mssql_python.OperationalError, mssql_python.InternalError)

        if bindings is None:
            bindings = ()
        else:
            bindings = [b.isoformat() if isinstance(b, dt.datetime) else b for b in bindings]
        return super().add_query(
            sql, auto_begin, bindings, abridge_sql_log, retryable_exceptions, retry_limit
        )
