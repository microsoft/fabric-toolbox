"""Tests for TokenProvider implementations and factory function."""

from unittest.mock import MagicMock, patch

import pytest

from fabric_assessment_tool.clients.token_provider import (
    AzureCliTokenProvider,
    FabricNotebookTokenProvider,
    create_token_provider,
)


class TestAzureCliTokenProvider:
    """Tests for AzureCliTokenProvider."""

    @patch("fabric_assessment_tool.clients.token_provider.subprocess")
    @patch("fabric_assessment_tool.clients.token_provider.AzureCliCredential")
    def test_get_token(self, mock_credential_cls, mock_subprocess):
        mock_credential = MagicMock()
        mock_credential.get_token.return_value = MagicMock(token="test-token")
        mock_credential_cls.return_value = mock_credential

        mock_subprocess.run.return_value = MagicMock(
            stdout=b'{"id": "sub-123", "name": "Test Sub"}'
        )
        mock_subprocess.PIPE = -1

        provider = AzureCliTokenProvider()
        token = provider.get_token("https://management.azure.com/.default")

        assert token == "test-token"

    @patch("fabric_assessment_tool.clients.token_provider.subprocess")
    @patch("fabric_assessment_tool.clients.token_provider.AzureCliCredential")
    def test_get_subscription_id(self, mock_credential_cls, mock_subprocess):
        mock_credential = MagicMock()
        mock_credential.get_token.return_value = MagicMock(token="test-token")
        mock_credential_cls.return_value = mock_credential

        mock_subprocess.run.return_value = MagicMock(
            stdout=b'{"id": "sub-123", "name": "Test Sub"}'
        )
        mock_subprocess.PIPE = -1

        provider = AzureCliTokenProvider()
        sub_id = provider.get_subscription_id()

        assert sub_id == "sub-123"


class TestFabricNotebookTokenProvider:
    """Tests for FabricNotebookTokenProvider."""

    def test_import_error_when_notebookutils_missing(self):
        with pytest.raises(ImportError, match="notebookutils is not available"):
            FabricNotebookTokenProvider()

    @patch.dict("sys.modules", {"notebookutils": MagicMock()})
    def test_get_token(self):
        import sys

        mock_notebookutils = sys.modules["notebookutils"]
        mock_notebookutils.credentials.getToken.return_value = "fabric-token"

        provider = FabricNotebookTokenProvider()
        token = provider.get_token("https://management.azure.com/.default")

        assert token == "fabric-token"
        mock_notebookutils.credentials.getToken.assert_called_once_with(
            "https://management.azure.com"
        )

    @patch.dict("sys.modules", {"notebookutils": MagicMock()})
    def test_get_token_strips_default_suffix(self):
        import sys

        mock_notebookutils = sys.modules["notebookutils"]
        mock_notebookutils.credentials.getToken.return_value = "fabric-token"

        provider = FabricNotebookTokenProvider()
        provider.get_token("https://dev.azuresynapse.net/.default")

        mock_notebookutils.credentials.getToken.assert_called_once_with(
            "https://dev.azuresynapse.net"
        )

    @patch.dict("sys.modules", {"notebookutils": MagicMock()})
    def test_get_subscription_id_returns_none(self):
        provider = FabricNotebookTokenProvider()
        assert provider.get_subscription_id() is None


class TestCreateTokenProvider:
    """Tests for the create_token_provider factory function."""

    @patch("fabric_assessment_tool.clients.token_provider.subprocess")
    @patch("fabric_assessment_tool.clients.token_provider.AzureCliCredential")
    def test_explicit_azure_cli(self, mock_credential_cls, mock_subprocess):
        mock_credential = MagicMock()
        mock_credential.get_token.return_value = MagicMock(token="test-token")
        mock_credential_cls.return_value = mock_credential
        mock_subprocess.run.return_value = MagicMock(
            stdout=b'{"id": "sub-123"}'
        )
        mock_subprocess.PIPE = -1

        provider = create_token_provider("azure-cli")
        assert isinstance(provider, AzureCliTokenProvider)

    @patch.dict("sys.modules", {"notebookutils": MagicMock()})
    def test_explicit_fabric(self):
        provider = create_token_provider("fabric")
        assert isinstance(provider, FabricNotebookTokenProvider)

    @patch("fabric_assessment_tool.clients.token_provider.subprocess")
    @patch("fabric_assessment_tool.clients.token_provider.AzureCliCredential")
    def test_auto_detect_falls_back_to_azure_cli(
        self, mock_credential_cls, mock_subprocess
    ):
        mock_credential = MagicMock()
        mock_credential.get_token.return_value = MagicMock(token="test-token")
        mock_credential_cls.return_value = mock_credential
        mock_subprocess.run.return_value = MagicMock(
            stdout=b'{"id": "sub-123"}'
        )
        mock_subprocess.PIPE = -1

        provider = create_token_provider(None)
        assert isinstance(provider, AzureCliTokenProvider)
