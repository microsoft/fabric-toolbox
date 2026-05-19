from dataclasses import dataclass

import pytest

from dbt.adapters.fabric.base_credentials import BaseFabricCredentials
from dbt.adapters.fabric.fabric_credentials import FabricCredentials


@dataclass
class ConcreteBaseCredentials(BaseFabricCredentials):
    @property
    def lakehouse_name(self) -> str | None:
        return None

    @property
    def type(self):
        return "fabric"


class TestBaseFabricCredentialsUniqueField:
    def test_returns_workspace_id_when_set(self):
        creds = ConcreteBaseCredentials(
            database="db", schema="dbo", workspace_id="ws-123", workspace_name="my-ws"
        )
        assert creds.unique_field == "ws-123"

    def test_falls_back_to_workspace_name(self):
        creds = ConcreteBaseCredentials(database="db", schema="dbo", workspace_name="my-ws")
        assert creds.unique_field == "my-ws"

    def test_asserts_when_neither_set(self):
        creds = ConcreteBaseCredentials(database="db", schema="dbo")
        with pytest.raises(AssertionError, match="Either workspace_id or workspace_name"):
            _ = creds.unique_field


class TestFabricCredentialsPostSerialize:
    def _serialize(self, **kwargs) -> dict:
        creds = FabricCredentials(database="db", schema="dbo", **kwargs)
        return creds.__post_serialize__(creds.__dict__.copy(), None)

    def test_auto_normalized_to_active_directory_default(self):
        result = self._serialize(authentication="auto")
        assert result["authentication"] == "ActiveDirectoryDefault"

    def test_windows_login_sets_authentication(self):
        result = self._serialize(windows_login=True)
        assert result["authentication"] == "Windows Login"

    def test_windows_login_overrides_explicit_auth(self):
        result = self._serialize(authentication="CLI", windows_login=True)
        assert result["authentication"] == "Windows Login"

    def test_serviceprincipal_normalized_through_super(self):
        result = self._serialize(authentication="serviceprincipal")
        assert result["authentication"] == "ActiveDirectoryServicePrincipal"

    def test_default_authentication_preserved(self):
        result = self._serialize()
        assert result["authentication"] == "ActiveDirectoryDefault"


class TestFabricCredentialsUniqueField:
    def test_returns_host_when_set(self):
        creds = FabricCredentials(
            database="db", schema="dbo", host="myhost.fabric.microsoft.com", workspace_name="ws"
        )
        assert creds.unique_field == "myhost.fabric.microsoft.com"

    def test_falls_back_to_workspace_id(self):
        creds = FabricCredentials(database="db", schema="dbo", workspace_id="ws-123")
        assert creds.unique_field == "ws-123"

    def test_falls_back_to_workspace_name(self):
        creds = FabricCredentials(database="db", schema="dbo", workspace_name="my-ws")
        assert creds.unique_field == "my-ws"


class TestFabricCredentialsAliases:
    def test_user_alias(self):
        assert FabricCredentials._ALIASES["user"] == "UID"

    def test_password_alias(self):
        assert FabricCredentials._ALIASES["password"] == "PWD"

    def test_server_alias(self):
        assert FabricCredentials._ALIASES["server"] == "host"

    def test_lakehouse_name_alias(self):
        assert FabricCredentials._ALIASES["lakehouse_name"] == "lakehouse"

    def test_inherits_base_aliases(self):
        assert FabricCredentials._ALIASES["auth"] == "authentication"
        assert FabricCredentials._ALIASES["app_id"] == "client_id"
        assert FabricCredentials._ALIASES["app_secret"] == "client_secret"
        assert FabricCredentials._ALIASES["workspace"] == "workspace_name"


class TestFabricCredentialsLockTimeout:
    def test_default_is_30_seconds(self):
        creds = FabricCredentials(database="db", schema="s")
        assert creds.lock_timeout == 30000

    def test_can_be_overridden(self):
        creds = FabricCredentials(database="db", schema="s", lock_timeout=60000)
        assert creds.lock_timeout == 60000

    def test_appears_in_connection_keys(self):
        creds = FabricCredentials(database="db", schema="s")
        assert "lock_timeout" in creds._connection_keys()
