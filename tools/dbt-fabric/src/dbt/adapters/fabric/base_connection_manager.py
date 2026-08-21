import abc
from typing import Any

import dbt_common.exceptions

from dbt.adapters.contracts.connection import (
    Connection,
)
from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabric.base_credentials import BaseFabricCredentials
from dbt.adapters.fabric.fabric_api_client import FabricApiClient
from dbt.adapters.fabric.fabric_token_provider import FabricTokenProvider
from dbt.adapters.fabric.purview_client import PurviewClient
from dbt.adapters.sql.connections import SQLConnectionManager

logger = AdapterLogger("fabricspark")


class BaseFabricConnectionManager(SQLConnectionManager, metaclass=abc.ABCMeta):
    _fabric_token_provider: FabricTokenProvider | None = None
    _fabric_api_client: FabricApiClient | None = None
    _purview_client: PurviewClient | None = None

    @classmethod
    def get_fabric_token_provider(cls, credentials: BaseFabricCredentials) -> FabricTokenProvider:
        """Return a shared FabricTokenProvider, creating one on first call.

        Args:
            credentials: Fabric connection credentials used to configure the provider.
        """
        if cls._fabric_token_provider is None:
            cls._fabric_token_provider = FabricTokenProvider(credentials)
        return cls._fabric_token_provider

    @classmethod
    def get_fabric_api_client(cls, credentials: BaseFabricCredentials) -> FabricApiClient:
        """Return a shared FabricApiClient, creating one on first call.

        Args:
            credentials: Fabric connection credentials used to configure the client.
        """
        if cls._fabric_api_client is None:
            cls._fabric_api_client = FabricApiClient(
                credentials, cls.get_fabric_token_provider(credentials)
            )
        return cls._fabric_api_client

    @classmethod
    def get_purview_client(cls, credentials: BaseFabricCredentials) -> PurviewClient:
        """Return a shared PurviewClient instance, creating it on first call."""
        if cls._purview_client is None:
            if not credentials.purview_endpoint:
                raise dbt_common.exceptions.DbtConfigError(
                    "purview_endpoint must be set in profiles.yml to use Purview integration"
                )
            cls._purview_client = PurviewClient(
                credentials.purview_endpoint, cls.get_fabric_token_provider(credentials)
            )
        return cls._purview_client

    # No transaction support
    def begin(self):  # type: ignore
        logger.debug("Not supported: begin")

    def commit_if_has_connection(self) -> None:
        logger.debug("Not supported: commit_if_has_connection")

    @classmethod
    def _rollback(cls, connection: Connection) -> None:  # type: ignore
        logger.debug("Not supported: rollback")

    def commit(self) -> None:  # type: ignore
        logger.debug("Not supported: commit")

    def add_begin_query(self, *args: Any, **kwargs: Any) -> None:  # type: ignore
        logger.debug("Not supported: add_begin_query")

    def add_commit_query(self, *args: Any, **kwargs: Any) -> None:  # type: ignore
        logger.debug("Not supported: add_commit_query")
