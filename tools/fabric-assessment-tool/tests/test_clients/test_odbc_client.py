"""Tests for OdbcClient connection string generation and authentication modes."""

import pytest

from fabric_assessment_tool.clients.odbc_client import OdbcClient


class TestOdbcClientConnectionString:
    """Test connection string generation for different auth modes."""

    def test_sql_auth_connection_string(self):
        """Test SQL authentication connection string generation."""
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            username="sqladmin",
            password="secret123",
            auth_mode="sql",
        )

        conn_str = client._connection_string

        # Should include server with full domain
        assert "Server=tcp:myworkspace.sql.azuresynapse.net,1433" in conn_str
        assert "Database=mydb" in conn_str
        assert "Uid=sqladmin" in conn_str
        assert "Pwd=secret123" in conn_str
        assert "Encrypt=yes" in conn_str
        assert "TrustServerCertificate=no" in conn_str
        # Should NOT include Authentication parameter for SQL auth
        assert "Authentication=" not in conn_str

    def test_sql_auth_with_full_domain(self):
        """Test SQL auth when workspace already has full domain."""
        client = OdbcClient(
            workspace_name="myworkspace.sql.azuresynapse.net",
            database="mydb",
            username="sqladmin",
            password="secret123",
            auth_mode="sql",
        )

        conn_str = client._connection_string

        # Should not duplicate the domain
        assert "Server=tcp:myworkspace.sql.azuresynapse.net,1433" in conn_str
        assert "myworkspace.sql.azuresynapse.net.sql.azuresynapse.net" not in conn_str

    def test_entra_interactive_connection_string(self):
        """Test Entra ID interactive authentication connection string."""
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            auth_mode="entra-interactive",
        )

        conn_str = client._connection_string

        assert "Server=tcp:myworkspace.sql.azuresynapse.net,1433" in conn_str
        assert "Database=mydb" in conn_str
        assert "Authentication=ActiveDirectoryInteractive" in conn_str
        assert "Encrypt=yes" in conn_str
        # Should NOT include Uid/Pwd for interactive auth
        assert "Uid=" not in conn_str
        assert "Pwd=" not in conn_str

    def test_entra_spn_connection_string(self):
        """Test Entra ID Service Principal authentication connection string."""
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            auth_mode="entra-spn",
            client_id="my-client-id",
            client_secret="my-client-secret",
            tenant_id="my-tenant-id",
        )

        conn_str = client._connection_string

        assert "Server=tcp:myworkspace.sql.azuresynapse.net,1433" in conn_str
        assert "Database=mydb" in conn_str
        assert "Authentication=ActiveDirectoryServicePrincipal" in conn_str
        # SPN auth uses UID for client_id and PWD for client_secret
        assert "UID=my-client-id" in conn_str
        assert "PWD=my-client-secret" in conn_str
        assert "Encrypt=yes" in conn_str

    def test_entra_spn_default_tenant(self):
        """Test Entra ID SPN auth defaults to 'common' tenant."""
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            auth_mode="entra-spn",
            client_id="my-client-id",
            client_secret="my-client-secret",
            # tenant_id not provided
        )

        # tenant_id should default to "common"
        assert client.tenant_id == "common"

    def test_entra_default_connection_string(self):
        """Test Entra ID default authentication connection string."""
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            auth_mode="entra-default",
        )

        conn_str = client._connection_string

        assert "Server=tcp:myworkspace.sql.azuresynapse.net,1433" in conn_str
        assert "Database=mydb" in conn_str
        assert "Authentication=ActiveDirectoryDefault" in conn_str
        assert "Encrypt=yes" in conn_str
        # Should NOT include Uid/Pwd for default auth
        assert "Uid=" not in conn_str
        assert "Pwd=" not in conn_str


class TestOdbcClientValidation:
    """Test parameter validation for different auth modes."""

    def test_sql_auth_requires_username(self):
        """Test that SQL auth mode requires username."""
        with pytest.raises(ValueError, match="SQL authentication requires"):
            OdbcClient(
                workspace_name="myworkspace",
                database="mydb",
                password="secret123",
                auth_mode="sql",
            )

    def test_sql_auth_requires_password(self):
        """Test that SQL auth mode requires password."""
        with pytest.raises(ValueError, match="SQL authentication requires"):
            OdbcClient(
                workspace_name="myworkspace",
                database="mydb",
                username="sqladmin",
                auth_mode="sql",
            )

    def test_entra_spn_requires_client_id(self):
        """Test that SPN auth mode requires client_id."""
        with pytest.raises(ValueError, match="Service Principal authentication requires"):
            OdbcClient(
                workspace_name="myworkspace",
                database="mydb",
                auth_mode="entra-spn",
                client_secret="my-secret",
            )

    def test_entra_spn_requires_client_secret(self):
        """Test that SPN auth mode requires client_secret."""
        with pytest.raises(ValueError, match="Service Principal authentication requires"):
            OdbcClient(
                workspace_name="myworkspace",
                database="mydb",
                auth_mode="entra-spn",
                client_id="my-client-id",
            )

    def test_entra_interactive_no_credentials_required(self):
        """Test that interactive mode doesn't require credentials."""
        # Should not raise
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            auth_mode="entra-interactive",
        )
        assert client.auth_mode == "entra-interactive"

    def test_entra_default_no_credentials_required(self):
        """Test that default mode doesn't require credentials."""
        # Should not raise
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            auth_mode="entra-default",
        )
        assert client.auth_mode == "entra-default"

    def test_unsupported_auth_mode(self):
        """Test that unsupported auth mode raises error."""
        with pytest.raises(ValueError, match="Unsupported authentication mode"):
            OdbcClient(
                workspace_name="myworkspace",
                database="mydb",
                auth_mode="invalid-mode",
            )


class TestOdbcClientDefaults:
    """Test default values and backward compatibility."""

    def test_default_auth_mode_is_sql(self):
        """Test that default auth mode is 'sql' for backward compatibility."""
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            username="sqladmin",
            password="secret123",
        )
        assert client.auth_mode == "sql"

    def test_legacy_constructor_still_works(self):
        """Test that old-style constructor still works (backward compatibility)."""
        # This mimics the old constructor signature
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            username="sqladmin",
            password="secret123",
        )
        assert client.workspace_name == "myworkspace"
        assert client.database == "mydb"
        assert client.username == "sqladmin"
        assert client.password == "secret123"
        assert "Uid=sqladmin" in client._connection_string
