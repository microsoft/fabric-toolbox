import time
from dataclasses import dataclass
from typing import Any

import pytest
from azure.core.credentials import AccessToken, TokenCredential

from dbt.adapters.fabric.base_credentials import BaseFabricCredentials
from dbt.adapters.fabric.fabric_token_provider import (
    DOTTED_PATH_RE,
    FabricTokenProvider,
    load_token_credential,
)


@dataclass
class ConcreteCredentials(BaseFabricCredentials):
    """Non-abstract subclass of BaseFabricCredentials for testing."""

    @property
    def lakehouse_name(self) -> str | None:
        return None

    @property
    def type(self):
        return "fabric"


@dataclass
class FakeCredentials:
    """Lightweight stand-in for FabricTokenProvider tests (not a real Credentials)."""

    database: str = "test_db"
    schema: str = "dbo"
    tenant_id: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    access_token: str | None = None
    token_scope: str | None = None
    authentication: str = "token_credential"
    credential_class: str | None = "tests.unit.test_token_credential_auth.StubTokenCredential"
    credential_kwargs: dict[str, Any] | None = None

    def __post_init__(self):
        if self.credential_kwargs is None:
            self.credential_kwargs = {}


class StubTokenCredential(TokenCredential):
    """A minimal TokenCredential for testing."""

    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def get_token(self, *scopes, **kwargs):
        return AccessToken(token="stub-token-value", expires_on=int(time.time()) + 3600)


class NotATokenCredential:
    """A class that does NOT implement TokenCredential."""

    def __init__(self, **kwargs):
        pass


class TestDottedPathRegex:
    def test_valid_two_part_path(self):
        assert DOTTED_PATH_RE.match("my_pkg.MyClass")

    def test_valid_deep_path(self):
        assert DOTTED_PATH_RE.match("my_pkg.sub.deep.MyClass")

    def test_rejects_single_name(self):
        assert not DOTTED_PATH_RE.match("MyClass")

    def test_rejects_leading_dot(self):
        assert not DOTTED_PATH_RE.match(".my_pkg.MyClass")

    def test_rejects_trailing_dot(self):
        assert not DOTTED_PATH_RE.match("my_pkg.MyClass.")

    def test_rejects_spaces(self):
        assert not DOTTED_PATH_RE.match("my pkg.MyClass")

    def test_rejects_slashes(self):
        assert not DOTTED_PATH_RE.match("my/pkg.MyClass")

    def test_rejects_hyphens_in_segments(self):
        assert not DOTTED_PATH_RE.match("my-pkg.MyClass")

    def test_rejects_leading_digit(self):
        assert not DOTTED_PATH_RE.match("1pkg.MyClass")

    def test_allows_digits_after_first_char(self):
        assert DOTTED_PATH_RE.match("pkg2.MyClass3")

    def test_allows_underscores(self):
        assert DOTTED_PATH_RE.match("_private.sub._internal.Cred")


class TestLoadTokenCredential:
    def test_loads_valid_credential(self):
        cred = load_token_credential(
            "tests.unit.test_token_credential_auth.StubTokenCredential", {}
        )
        assert isinstance(cred, TokenCredential)
        token = cred.get_token("https://example.com/.default")
        assert token.token == "stub-token-value"

    def test_passes_kwargs(self):
        cred = load_token_credential(
            "tests.unit.test_token_credential_auth.StubTokenCredential",
            {"custom_key": "custom_value"},
        )
        assert cred.kwargs == {"custom_key": "custom_value"}

    def test_rejects_non_dotted_path(self):
        with pytest.raises(ValueError, match="dotted import path"):
            load_token_credential("NotDotted", {})

    def test_rejects_bad_module(self):
        with pytest.raises(ValueError, match="Could not import module"):
            load_token_credential("nonexistent_module.MyClass", {})

    def test_rejects_bad_class_name(self):
        with pytest.raises(ValueError, match="has no attribute"):
            load_token_credential("tests.unit.test_token_credential_auth.NonexistentClass", {})

    def test_handles_none_kwargs(self):
        cred = load_token_credential(
            "tests.unit.test_token_credential_auth.StubTokenCredential", None
        )
        assert isinstance(cred, TokenCredential)
        assert cred.kwargs == {}

    def test_rejects_non_token_credential(self):
        with pytest.raises(TypeError, match="not a TokenCredential"):
            load_token_credential("tests.unit.test_token_credential_auth.NotATokenCredential", {})


class TestFabricTokenProviderTokenCredential:
    def setup_method(self):
        FabricTokenProvider._tokens.clear()

    def test_get_access_token_with_token_credential(self):
        creds = FakeCredentials()
        provider = FabricTokenProvider(creds)

        token = provider.get_access_token("https://example.com/.default")
        assert token == "stub-token-value"

    def test_caches_credential_instance(self):
        creds = FakeCredentials()
        provider = FabricTokenProvider(creds)

        provider.get_access_token("https://example.com/.default")
        first_cred = provider._custom_credential
        assert first_cred is not None

        FabricTokenProvider._tokens.clear()
        provider.get_access_token("https://example.com/.default")
        second_cred = provider._custom_credential

        assert first_cred is second_cred

    def test_passes_credential_kwargs(self):
        creds = FakeCredentials(credential_kwargs={"token_url": "https://example.com/token"})
        provider = FabricTokenProvider(creds)

        provider.get_access_token("https://example.com/.default")
        assert provider._custom_credential is not None
        assert provider._custom_credential.kwargs == {"token_url": "https://example.com/token"}

    def test_rejects_missing_credential_class(self):
        creds = FakeCredentials(credential_class=None)
        provider = FabricTokenProvider(creds)

        with pytest.raises(AssertionError):
            provider.get_access_token("https://example.com/.default")


def _make_serialized_dict(**overrides) -> dict:
    """Build a dict that looks like what __post_serialize__ receives."""
    base = {"authentication": "CLI"}
    base.update(overrides)
    return base


class TestCredentialsValidation:
    def _serialize(self, **kwargs) -> dict:
        creds = ConcreteCredentials(database="db", schema="dbo", **kwargs)
        return creds.__post_serialize__(creds.__dict__.copy(), None)

    def test_token_credential_requires_credential_class(self):
        with pytest.raises(ValueError, match="credential_class is required"):
            self._serialize(authentication="token_credential", credential_class=None)

    def test_token_credential_accepts_credential_class(self):
        result = self._serialize(
            authentication="token_credential", credential_class="my_pkg.auth.MyCred"
        )
        assert result["credential_class"] == "my_pkg.auth.MyCred"

    def test_non_token_credential_rejects_credential_class(self):
        with pytest.raises(ValueError, match="can only be used"):
            self._serialize(authentication="CLI", credential_class="my_pkg.auth.MyCred")

    def test_non_token_credential_rejects_credential_kwargs(self):
        with pytest.raises(ValueError, match="can only be used"):
            self._serialize(authentication="CLI", credential_kwargs={"key": "value"})

    def test_non_token_credential_allows_empty(self):
        result = self._serialize(authentication="CLI")
        assert result["authentication"] == "CLI"

    def test_serviceprincipal_alias_still_works(self):
        result = self._serialize(authentication="serviceprincipal")
        assert result["authentication"] == "ActiveDirectoryServicePrincipal"

    def test_credential_class_in_connection_keys(self):
        creds = ConcreteCredentials(database="db", schema="dbo")
        keys = creds._connection_keys()
        assert "credential_class" in keys
