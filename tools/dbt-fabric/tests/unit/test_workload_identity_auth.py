import time
from dataclasses import dataclass
from typing import Any
from unittest.mock import patch

import pytest
from azure.core.credentials import AccessToken

from dbt.adapters.fabric.base_credentials import BaseFabricCredentials
from dbt.adapters.fabric.fabric_token_provider import (
    FabricTokenProvider,
    _build_federated_token_callable,
)


@dataclass
class ConcreteCredentials(BaseFabricCredentials):
    @property
    def lakehouse_name(self) -> str | None:
        return None

    @property
    def type(self):
        return "fabric"


@dataclass
class FakeWorkloadCredentials:
    database: str = "test_db"
    schema: str = "dbo"
    tenant_id: str | None = "test-tenant"
    client_id: str | None = "test-client"
    client_secret: str | None = None
    access_token: str | None = None
    token_scope: str | None = None
    authentication: str = "workload_identity"
    credential_class: str | None = None
    credential_kwargs: dict[str, Any] | None = None
    federated_token_url: str | None = None
    federated_token_header: str | None = None
    federated_token_file: str | None = None


class TestCredentialsValidation:
    def _serialize(self, **kwargs) -> dict:
        creds = ConcreteCredentials(database="db", schema="dbo", **kwargs)
        return creds.__post_serialize__(creds.__dict__.copy(), None)

    def test_workload_identity_requires_tenant_id(self):
        with pytest.raises(ValueError, match="tenant_id and client_id are required"):
            self._serialize(
                authentication="workload_identity",
                client_id="test",
                federated_token_url="https://example.com",
            )

    def test_workload_identity_requires_client_id(self):
        with pytest.raises(ValueError, match="tenant_id and client_id are required"):
            self._serialize(
                authentication="workload_identity",
                tenant_id="test",
                federated_token_url="https://example.com",
            )

    def test_workload_identity_requires_exactly_one_source(self):
        with pytest.raises(ValueError, match="Exactly one of"):
            self._serialize(
                authentication="workload_identity",
                tenant_id="test",
                client_id="test",
            )

    def test_workload_identity_rejects_both_sources(self):
        with pytest.raises(ValueError, match="Exactly one of"):
            self._serialize(
                authentication="workload_identity",
                tenant_id="test",
                client_id="test",
                federated_token_url="https://example.com",
                federated_token_file="/tmp/token",
            )

    def test_workload_identity_accepts_url(self):
        result = self._serialize(
            authentication="workload_identity",
            tenant_id="test",
            client_id="test",
            federated_token_url="https://example.com",
        )
        assert result["federated_token_url"] == "https://example.com"

    def test_workload_identity_accepts_file(self):
        result = self._serialize(
            authentication="workload_identity",
            tenant_id="test",
            client_id="test",
            federated_token_file="/tmp/token",
        )
        assert result["federated_token_file"] == "/tmp/token"

    def test_workload_identity_accepts_url_with_header(self):
        result = self._serialize(
            authentication="workload_identity",
            tenant_id="test",
            client_id="test",
            federated_token_url="https://example.com",
            federated_token_header="bearer my-token",
        )
        assert result["federated_token_header"] == "bearer my-token"

    def test_workload_identity_rejects_header_with_file(self):
        with pytest.raises(ValueError, match="can only be used with federated_token_url"):
            self._serialize(
                authentication="workload_identity",
                tenant_id="test",
                client_id="test",
                federated_token_file="/tmp/token",
                federated_token_header="bearer my-token",
            )

    def test_other_auth_rejects_federated_token_url(self):
        with pytest.raises(ValueError, match="can only be used.*workload_identity"):
            self._serialize(
                authentication="CLI",
                federated_token_url="https://example.com",
            )

    def test_other_auth_rejects_federated_token_file(self):
        with pytest.raises(ValueError, match="can only be used.*workload_identity"):
            self._serialize(
                authentication="CLI",
                federated_token_file="/tmp/token",
            )

    def test_other_auth_rejects_federated_token_header(self):
        with pytest.raises(ValueError, match="can only be used.*workload_identity"):
            self._serialize(
                authentication="CLI",
                federated_token_header="bearer test",
            )

    def test_connection_keys_include_federated_fields(self):
        creds = ConcreteCredentials(database="db", schema="dbo")
        keys = creds._connection_keys()
        assert "federated_token_url" in keys
        assert "federated_token_file" in keys


class TestBuildFederatedTokenCallable:
    def test_url_mode_fetches_token(self):
        creds = FakeWorkloadCredentials(
            federated_token_url="https://oidc.example.com/token",
            federated_token_header="bearer request-token",
        )

        callback = _build_federated_token_callable(creds)

        with patch("dbt.adapters.fabric.fabric_token_provider.requests") as mock_requests:
            mock_response = mock_requests.get.return_value
            mock_response.json.return_value = {"value": "fresh-oidc-jwt"}

            result = callback()

            assert result == "fresh-oidc-jwt"
            mock_requests.get.assert_called_once_with(
                "https://oidc.example.com/token",
                headers={"Authorization": "bearer request-token"},
                timeout=30,
            )
            mock_response.raise_for_status.assert_called_once()

    def test_url_mode_without_header(self):
        creds = FakeWorkloadCredentials(
            federated_token_url="https://oidc.example.com/token",
        )

        callback = _build_federated_token_callable(creds)

        with patch("dbt.adapters.fabric.fabric_token_provider.requests") as mock_requests:
            mock_response = mock_requests.get.return_value
            mock_response.json.return_value = {"value": "jwt-no-header"}

            result = callback()

            assert result == "jwt-no-header"
            mock_requests.get.assert_called_once_with(
                "https://oidc.example.com/token",
                headers={},
                timeout=30,
            )

    def test_file_mode_reads_token(self, tmp_path):
        token_file = tmp_path / "token"
        token_file.write_text("file-based-jwt\n")

        creds = FakeWorkloadCredentials(
            federated_token_file=str(token_file),
        )

        callback = _build_federated_token_callable(creds)
        result = callback()

        assert result == "file-based-jwt"

    def test_file_mode_rereads_on_each_call(self, tmp_path):
        token_file = tmp_path / "token"
        token_file.write_text("first-jwt")

        creds = FakeWorkloadCredentials(
            federated_token_file=str(token_file),
        )

        callback = _build_federated_token_callable(creds)
        assert callback() == "first-jwt"

        token_file.write_text("refreshed-jwt")
        assert callback() == "refreshed-jwt"


class TestFabricTokenProviderWorkloadIdentity:
    def setup_method(self):
        FabricTokenProvider._tokens.clear()

    def test_creates_client_assertion_credential(self):
        creds = FakeWorkloadCredentials(
            federated_token_url="https://oidc.example.com/token",
        )
        provider = FabricTokenProvider(creds)

        with (
            patch(
                "dbt.adapters.fabric.fabric_token_provider.ClientAssertionCredential"
            ) as mock_cac,
            patch("dbt.adapters.fabric.fabric_token_provider.requests"),
        ):
            mock_cac.return_value.get_token.return_value = AccessToken(
                token="azure-access-token", expires_on=int(time.time()) + 3600
            )

            token = provider.get_access_token("https://example.com/.default")

            assert token == "azure-access-token"
            mock_cac.assert_called_once()
            call_kwargs = mock_cac.call_args
            assert call_kwargs.kwargs["tenant_id"] == "test-tenant"
            assert call_kwargs.kwargs["client_id"] == "test-client"
            assert callable(call_kwargs.kwargs["func"])

    def test_caches_credential_instance(self):
        creds = FakeWorkloadCredentials(
            federated_token_url="https://oidc.example.com/token",
        )
        provider = FabricTokenProvider(creds)

        with (
            patch(
                "dbt.adapters.fabric.fabric_token_provider.ClientAssertionCredential"
            ) as mock_cac,
            patch("dbt.adapters.fabric.fabric_token_provider.requests"),
        ):
            mock_cac.return_value.get_token.return_value = AccessToken(
                token="azure-access-token", expires_on=int(time.time()) + 3600
            )

            provider.get_access_token("https://example.com/.default")
            first = provider._custom_credential

            FabricTokenProvider._tokens.clear()
            provider.get_access_token("https://example.com/.default")
            second = provider._custom_credential

            assert first is second
            mock_cac.assert_called_once()
