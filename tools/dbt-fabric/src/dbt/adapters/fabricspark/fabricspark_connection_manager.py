from contextlib import contextmanager
from typing import Any

from dbt.adapters.contracts.connection import AdapterResponse, Connection, ConnectionState
from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabric.base_connection_manager import BaseFabricConnectionManager
from dbt.adapters.fabric.fabric_hc_livy_session import HighConcurrencyLivySession
from dbt.adapters.fabricspark.fabricspark_connection import FabricSparkConnection

logger = AdapterLogger("fabricspark")


class FabricSparkConnectionManager(BaseFabricConnectionManager):
    TYPE = "fabricspark"

    @contextmanager
    def exception_handler(self, sql: str):
        try:
            yield

        except Exception as exc:
            logger.debug(f"Error while running:\n{sql}")
            logger.debug(exc)
            raise

    def cancel(self, connection: Connection):
        connection.handle.cancel()

    @classmethod
    def get_response(cls, cursor: Any) -> AdapterResponse:
        msg = "\n".join(str(message) for message in cursor.messages)
        return AdapterResponse(
            _message=msg if msg else "OK",
            rows_affected=cursor.rowcount,
            query_id=str(cursor.statement_id),
            code=cursor.status_code,
        )

    @classmethod
    def data_type_code_to_name(cls, type_code: type | str) -> str:
        if isinstance(type_code, str):
            return type_code
        return type_code.__name__.upper()

    @classmethod
    def open(cls, connection: Connection) -> Connection:
        if connection.state == ConnectionState.OPEN:
            logger.debug("Connection is already open, skipping open.")
            return connection

        credentials = connection.credentials

        def connect() -> FabricSparkConnection:
            api_client = cls.get_fabric_api_client(credentials)
            livy_session = HighConcurrencyLivySession(api_client)
            livy_session.wait_for_session_ready()
            return FabricSparkConnection(livy_session)

        return cls.retry_connection(
            connection,
            connect=connect,
            logger=logger,
            retry_limit=credentials.retries,
            retry_timeout=10,
            retryable_exceptions=[TimeoutError],
        )
