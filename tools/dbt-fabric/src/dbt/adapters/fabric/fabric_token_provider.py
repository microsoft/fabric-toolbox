import importlib
import re
import struct
import time
from collections.abc import Callable
from itertools import chain, repeat
from typing import Any

import requests
from azure.core.credentials import AccessToken, TokenCredential
from azure.identity import (
    AzureCliCredential,
    ClientAssertionCredential,
    ClientSecretCredential,
    DefaultAzureCredential,
    DeviceCodeCredential,
    EnvironmentCredential,
    InteractiveBrowserCredential,
    ManagedIdentityCredential,
)

from dbt.adapters.fabric.base_credentials import BaseFabricCredentials

DOTTED_PATH_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$")


def get_notebookutils_access_token(scope: str) -> AccessToken:
    """Acquire an access token via Fabric notebookutils (for use inside Fabric notebooks).

    Args:
        scope: The OAuth scope to request a token for.
    """
    from notebookutils import credentials

    aad_token = credentials.getToken(scope)
    expires_on = int(time.time() + 4500.0)
    token = AccessToken(
        token=aad_token,
        expires_on=expires_on,
    )
    return token


def _build_federated_token_callable(
    credentials: BaseFabricCredentials,
) -> Callable[[], str]:
    if credentials.federated_token_url:
        url = credentials.federated_token_url
        headers = {}
        if credentials.federated_token_header:
            headers["Authorization"] = credentials.federated_token_header

        def fetch_from_url() -> str:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()["value"]

        return fetch_from_url

    if not credentials.federated_token_file:
        raise ValueError(
            "Either federated_token_url or federated_token_file must be configured "
            "for workload_identity authentication"
        )
    path = credentials.federated_token_file

    def read_from_file() -> str:
        with open(path) as f:
            return f.read().strip()

    return read_from_file


def load_token_credential(
    credential_class: str, credential_kwargs: dict[str, Any] | None
) -> TokenCredential:
    credential_kwargs = credential_kwargs or {}

    if not DOTTED_PATH_RE.match(credential_class):
        raise ValueError(
            f"credential_class must be a dotted import path "
            f"(e.g. 'my_pkg.auth.MyCredential'), got: {credential_class!r}"
        )

    module_path, class_name = credential_class.rsplit(".", 1)

    try:
        module = importlib.import_module(module_path)
    except ModuleNotFoundError as exc:
        raise ValueError(
            f"Could not import module {module_path!r} from credential_class {credential_class!r}"
        ) from exc

    try:
        cls = getattr(module, class_name)
    except AttributeError as exc:
        raise ValueError(
            f"Module {module_path!r} has no attribute {class_name!r} "
            f"(from credential_class {credential_class!r})"
        ) from exc

    instance = cls(**credential_kwargs)

    if not isinstance(instance, TokenCredential):
        raise TypeError(
            f"{credential_class!r} is not a TokenCredential implementation. "
            f"The class must implement the azure.core.credentials.TokenCredential protocol "
            f"(i.e. have a get_token method)."
        )

    return instance


class FabricTokenProvider:
    SQL_CREDENTIAL_SCOPE = "https://database.windows.net/.default"
    FABRIC_CREDENTIAL_SCOPE = "https://analysis.windows.net/powerbi/api/.default"
    FABRIC_SPARK_CREDENTIAL_SCOPE = "pbi"
    _tokens: dict[str, AccessToken] = {}
    SQL_COPT_SS_ACCESS_TOKEN = 1256

    def __init__(self, credentials: BaseFabricCredentials):
        self.credentials = credentials
        self._custom_credential: TokenCredential | None = None

    def get_access_token(self, scope: str | None = None) -> str:
        """Return a valid access token for the given scope, refreshing if near expiry.

        Tokens are cached per scope and reused until they have less than 5 minutes
        of validity remaining.

        Args:
            scope: The OAuth scope. Defaults to the Fabric API scope if not provided.

        Raises:
            ValueError: If the configured authentication method is not supported,
                or if required credentials (client_id, etc.) are missing.
        """
        MAX_REMAINING_TIME = 300

        if self.credentials.access_token:
            return self.credentials.access_token

        scope = scope or self.credentials.token_scope or self.FABRIC_CREDENTIAL_SCOPE

        current_token = self._tokens.get(scope)
        time_remaining = (
            (current_token.expires_on - time.time()) if current_token else MAX_REMAINING_TIME
        )

        if current_token and time_remaining >= MAX_REMAINING_TIME:
            return current_token.token

        credential: Any | None = None
        token: AccessToken

        if self.credentials.authentication.lower() == "activedirectoryserviceprincipal":
            if not all(
                [
                    self.credentials.client_id,
                    self.credentials.client_secret,
                    self.credentials.tenant_id,
                ]
            ):
                raise ValueError(
                    "client_id, client_secret, and tenant_id must be provided "
                    "for ActiveDirectoryServicePrincipal authentication."
                )
            credential = ClientSecretCredential(
                client_id=self.credentials.client_id,  # type: ignore
                client_secret=self.credentials.client_secret,  # type: ignore
                tenant_id=self.credentials.tenant_id,  # type: ignore
            )
        elif self.credentials.authentication.lower() == "activedirectorydefault":
            credential = DefaultAzureCredential()
        elif self.credentials.authentication.lower() == "activedirectoryinteractive":
            credential = InteractiveBrowserCredential()
        elif self.credentials.authentication.lower() == "activedirectorydevicecodeflow":
            credential = DeviceCodeCredential()
        elif self.credentials.authentication.lower() == "activedirectorymsi":
            credential = ManagedIdentityCredential()
        elif self.credentials.authentication.lower() == "cli":
            credential = AzureCliCredential()
        elif self.credentials.authentication.lower() == "environment":
            credential = EnvironmentCredential()
        elif self.credentials.authentication.lower() == "notebookutils":
            token = get_notebookutils_access_token(scope)
        elif self.credentials.authentication.lower() == "workload_identity":
            if self._custom_credential is None:
                self._custom_credential = ClientAssertionCredential(
                    tenant_id=self.credentials.tenant_id,
                    client_id=self.credentials.client_id,
                    func=_build_federated_token_callable(self.credentials),
                )
            credential = self._custom_credential
        elif self.credentials.authentication.lower() == "token_credential":
            if self._custom_credential is None:
                assert self.credentials.credential_class is not None
                self._custom_credential = load_token_credential(
                    self.credentials.credential_class,
                    self.credentials.credential_kwargs,
                )
            credential = self._custom_credential
        else:
            raise ValueError(
                f"Unsupported authentication method: {self.credentials.authentication}"
            )

        if credential is not None:
            token = credential.get_token(scope)

        self._tokens[scope] = token
        return token.token

    def get_sql_attrs_before(self) -> dict[int, bytes] | None:
        """Build the SQL connection attrs_before dict with an encoded access token.

        Returns None when ActiveDirectory authentication is used, since the
        mssql-python driver handles token acquisition internally in that case.
        """
        if "ActiveDirectory" in self.credentials.authentication:
            return None

        token = self.get_access_token(scope=self.SQL_CREDENTIAL_SCOPE)
        token_byte_value = bytes(token, "UTF-8")
        encoded_bytes = bytes(chain.from_iterable(zip(token_byte_value, repeat(0))))
        token_bytes = struct.pack("<i", len(encoded_bytes)) + encoded_bytes
        return {self.SQL_COPT_SS_ACCESS_TOKEN: token_bytes}
