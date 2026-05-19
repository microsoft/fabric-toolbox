import abc
from dataclasses import dataclass, field
from typing import Any

from dbt.adapters.contracts.connection import Credentials


@dataclass
class BaseFabricCredentials(Credentials, metaclass=abc.ABCMeta):
    database: str
    schema: str
    tenant_id: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    access_token: str | None = None
    token_scope: str | None = None
    authentication: str = "ActiveDirectoryDefault"
    retries: int = 3
    query_timeout: int = 24 * 60 * 60  # 24 hours in seconds
    spark_session_timeout: int = 15 * 60  # 15 minutes in seconds
    workspace_id: str | None = None
    workspace_name: str | None = None
    fabric_base_api_uri: str = "https://api.fabric.microsoft.com/v1"
    powerbi_base_api_uri: str = "https://api.powerbi.com/v1.0"
    livy_session_name: str = "dbt-fabric"
    purview_endpoint: str | None = None
    credential_class: str | None = None
    credential_kwargs: dict[str, Any] = field(default_factory=dict)
    federated_token_url: str | None = None
    federated_token_header: str | None = None
    federated_token_file: str | None = None

    _ALIASES = {
        "trusted_connection": "windows_login",
        "auth": "authentication",
        "app_id": "client_id",
        "app_secret": "client_secret",
        "workspace": "workspace_name",
        "purview": "purview_endpoint",
    }

    def __post_serialize__(self, dct: dict, context: dict | None = None) -> dict[Any, Any]:
        des = super().__post_serialize__(dct, context)

        if des.get("authentication", "").lower().strip() == "serviceprincipal":
            des["authentication"] = "ActiveDirectoryServicePrincipal"

        auth = des.get("authentication", "").lower().strip()
        if auth == "token_credential" and not des.get("credential_class"):
            raise ValueError(
                "credential_class is required when authentication is 'token_credential'"
            )
        if auth != "token_credential" and (
            des.get("credential_class") or des.get("credential_kwargs")
        ):
            raise ValueError(
                "credential_class and credential_kwargs can only be used "
                "with authentication: token_credential"
            )

        if auth == "workload_identity":
            if not des.get("tenant_id") or not des.get("client_id"):
                raise ValueError(
                    "tenant_id and client_id are required "
                    "when authentication is 'workload_identity'"
                )
            has_url = bool(des.get("federated_token_url"))
            has_file = bool(des.get("federated_token_file"))
            if has_url == has_file:
                raise ValueError(
                    "Exactly one of federated_token_url or federated_token_file "
                    "must be set when authentication is 'workload_identity'"
                )
            if has_file and des.get("federated_token_header"):
                raise ValueError(
                    "federated_token_header can only be used with federated_token_url, "
                    "not with federated_token_file"
                )
        else:
            if des.get("federated_token_url") or des.get("federated_token_file"):
                raise ValueError(
                    "federated_token_url and federated_token_file can only be used "
                    "with authentication: workload_identity"
                )
            if des.get("federated_token_header"):
                raise ValueError(
                    "federated_token_header can only be used "
                    "with authentication: workload_identity"
                )

        return des

    @property
    @abc.abstractmethod
    def lakehouse_name(self) -> str | None:
        """The name of the Lakehouse to use for Python models."""
        ...

    def _connection_keys(self) -> tuple[str, ...]:
        return (
            "database",
            "schema",
            "tenant_id",
            "client_id",
            "credential_class",
            "token_scope",
            "authentication",
            "retries",
            "workspace_id",
            "workspace_name",
            "query_timeout",
            "fabric_base_api_uri",
            "powerbi_base_api_uri",
            "livy_session_name",
            "purview_endpoint",
            "federated_token_url",
            "federated_token_file",
        )

    @property
    def unique_field(self) -> str:
        ws_unique = self.workspace_id or self.workspace_name
        assert ws_unique is not None, "Either workspace_id or workspace_name must be provided"
        return ws_unique
