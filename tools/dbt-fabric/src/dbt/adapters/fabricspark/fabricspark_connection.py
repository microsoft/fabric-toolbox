from __future__ import annotations

import weakref
from typing import TYPE_CHECKING

from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabricspark.fabricspark_cursor import FabricSparkCursor

if TYPE_CHECKING:
    from dbt.adapters.fabric.fabric_hc_livy_session import HighConcurrencyLivySession

logger = AdapterLogger("fabricspark")


class FabricSparkConnection:
    """A DB-API 2.0 (PEP 249) compatible connection for Fabric Spark."""

    def __init__(self, livy_session: HighConcurrencyLivySession) -> None:
        self._livy_session: HighConcurrencyLivySession | None = livy_session
        self._cursors: weakref.WeakSet[FabricSparkCursor] = weakref.WeakSet()

    def close(self) -> None:
        for cursor in self._cursors:
            cursor.close()
        self._cursors.clear()
        if self._livy_session is not None:
            self._livy_session.close()
        self._livy_session = None

    def cancel(self) -> None:
        for cursor in self._cursors:
            cursor.cancel()

    def rollback(self) -> None:
        logger.debug("Rollback is not supported in Fabric Spark, skipping.")

    def cursor(self) -> FabricSparkCursor:
        cursor = FabricSparkCursor(self)
        self._cursors.add(cursor)
        return cursor

    def get_livy_session(self) -> HighConcurrencyLivySession:
        assert self._livy_session is not None, "Connection is closed"
        return self._livy_session
