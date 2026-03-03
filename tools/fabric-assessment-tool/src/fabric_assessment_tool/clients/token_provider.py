# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

import json
import logging
import subprocess
from typing import Optional, Protocol, runtime_checkable

from azure.identity import AzureCliCredential

logger = logging.getLogger(__name__)


@runtime_checkable
class TokenProvider(Protocol):
    """Protocol for providing authentication tokens and subscription info."""

    def get_token(self, scope: str) -> str:
        """Get an access token for the given scope/audience.

        Args:
            scope: The token scope (e.g., "https://management.azure.com/.default")

        Returns:
            Access token string
        """
        ...

    def get_subscription_id(self) -> Optional[str]:
        """Get the default Azure subscription ID, if available.

        Returns:
            Subscription ID string, or None if not available
        """
        ...


class AzureCliTokenProvider:
    """Token provider that uses Azure CLI credentials."""

    def __init__(self) -> None:
        try:
            self._credential = AzureCliCredential()
            # Validate that the credential works
            self._credential.get_token("https://management.azure.com/.default")
            self._account_info = self._load_account_info()
        except Exception as e:
            raise Exception(f"Failed to authenticate with Azure: {e}")

    def get_token(self, scope: str) -> str:
        return self._credential.get_token(scope).token

    def get_subscription_id(self) -> Optional[str]:
        return self._account_info.get("id")

    def _load_account_info(self) -> dict:
        cmd = "az account show"
        output = subprocess.run(
            cmd,
            shell=True,
            check=False,
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
        )
        result = json.loads(output.stdout)
        if not result:
            raise Exception("Failed to get account info from Azure CLI")
        return result


class FabricNotebookTokenProvider:
    """Token provider for Microsoft Fabric Notebook environments.

    Uses notebookutils.credentials.getToken() which is available
    in the Fabric Notebook runtime.
    """

    def __init__(self) -> None:
        try:
            import notebookutils  # type: ignore[import-not-found]

            self._notebookutils = notebookutils
        except ImportError:
            raise ImportError(
                "notebookutils is not available. "
                "This provider can only be used inside a Microsoft Fabric Notebook."
            )

    def get_token(self, scope: str) -> str:
        # notebookutils.credentials.getToken expects the audience URI
        # without the .default suffix
        audience = scope.replace("/.default", "").rstrip("/")
        return self._notebookutils.credentials.getToken(audience)

    def get_subscription_id(self) -> Optional[str]:
        # No equivalent to 'az account show' in Fabric Notebooks
        return None


def create_token_provider(auth_method: Optional[str] = None) -> TokenProvider:
    """Factory function to create the appropriate token provider.

    Args:
        auth_method: Authentication method to use. Options:
            - "azure-cli": Use Azure CLI credentials
            - "fabric": Use Fabric Notebook credentials
            - None: Auto-detect environment

    Returns:
        A TokenProvider instance
    """
    if auth_method == "azure-cli":
        return AzureCliTokenProvider()

    if auth_method == "fabric":
        return FabricNotebookTokenProvider()

    # Auto-detect: try Fabric first, fall back to Azure CLI
    try:
        import notebookutils  # type: ignore[import-not-found] # noqa: F401

        logger.info("Detected Fabric Notebook environment, using Fabric auth")
        return FabricNotebookTokenProvider()
    except ImportError:
        logger.info("Using Azure CLI authentication")
        return AzureCliTokenProvider()
