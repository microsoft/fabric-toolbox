# Configuration

!!! info "This page covers both adapter types"

    This adapter supports two Microsoft Fabric compute engines: **Data Warehouse** (`type: fabric`) and **Lakehouse** (`type: fabricspark`). Configuration options that are specific to one adapter type are marked accordingly. For a comprehensive guide on using the Lakehouse adapter, see the [Lakehouse guide](lakehouse.md).

You'll need to create a profile in the [profiles.yml](https://docs.getdbt.com/docs/core/connect-data-platform/profiles.yml) file to connect to Microsoft Fabric. The adapter offers several ways to configure your connection so that it can be flexible to your needs.

## Example profiles.yml

=== "Data Warehouse (T-SQL)"

    ```yaml
    default:
      target: dev
      outputs:
        dev:
          type: fabric
          workspace: your workspace name
          database: name_of_your_data_warehouse
          schema: schema_to_build_models_in
    ```

=== "Lakehouse (Spark SQL)"

    ```yaml
    default:
      target: dev
      outputs:
        dev:
          type: fabricspark
          workspace: your workspace name
          database: name_of_your_lakehouse
          schema: schema_in_your_lakehouse
    ```

??? tip "Use environment variables anywhere"

    You can use environment variables in any configuration value in your `profiles.yml` file.

    ```yaml
    default:
      target: dev
      outputs:
        dev:
          type: fabric
          ...
          client_id: "{{ env_var('AZURE_CLIENT_ID', 'an optional default value') }}"
          client_secret: "{{ env_var('AZURE_CLIENT_SECRET') }}"
    ```
    
    Make sure to surround the Jinja block with quotes.

## All configuration options

### `type`

**Required configuration option.**

Possible values: `fabric`, `fabricspark`

| Value | Compute engine | SQL dialect |
| --- | --- | --- |
| `fabric` | Fabric Data Warehouse | T-SQL |
| `fabricspark` | Fabric Lakehouse | Spark SQL |

### `host`

Alias: `server`<br>
Example value: `abc-123.datawarehouse.fabric.microsoft.com`

The server part of your connection string. This is unique per Workspace in Fabric.

You can leave this empty and let the adapter find it automatically by providing information about your Workspace. See [`workspace_name`](#workspace_name) and [`workspace_id`](#workspace_id).

!!! info "Not used for FabricSpark"

    This option is not used when `type` is `fabricspark`. The Lakehouse adapter connects via the Fabric Livy API, not TDS. The Livy endpoint is resolved automatically from [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id).

### `database`

**Required configuration option.**

=== "Data Warehouse"

    Example value: `gold_dwh`

    The name of your **Data Warehouse** in Fabric.

=== "Lakehouse"

    Example value: `bronze_lakehouse`

    The name of your **Lakehouse** in Fabric. The adapter uses this as the target for the Livy API connection.

    !!! tip "This IS the lakehouse"

        For `type: fabricspark`, the `database` field is how you specify which Lakehouse to connect to. There is no separate `lakehouse` or `lakehouse_name` option for this adapter type.

It's recommended to avoid using spaces in the name, although it's supported.

### `schema`

**Required configuration option.**

Example value: `dbt`

The schema where dbt will build models. You must have write access to this schema. It's recommended to avoid using spaces in the schema name, although it's supported.

??? tip "Override per model"

    The schema can be overridden per model/seed/test/folder/... using the [`schema`](https://docs.getdbt.com/reference/resource-configs/schema) config.

??? tip "Further customization"

    You can even completely customize how dbt generates the schema name using the [`generate_schema_name`](https://docs.getdbt.com/docs/build/custom-schemas) macro.

### `workspace_name`

Alias: `workspace`<br>
Example value: `My Workspace`

The name of your Fabric Workspace.

- For `type: fabric`: used to automatically find the [`host`](#host) value. Not required if `host` is provided (except for Python models).
- For `type: fabricspark`: **required** (unless [`workspace_id`](#workspace_id) is provided). The Lakehouse adapter always needs the workspace to resolve the Livy API endpoint.

Not used if [`workspace_id`](#workspace_id) is also provided.

??? info "Python models (Data Warehouse)"

    If you are using Python models with `type: fabric`, either [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) must be provided.

??? info "auth: ActiveDirectoryServicePrincipal"

    When using this option together with [`authentication`](#authentication) set to `ActiveDirectoryServicePrincipal`, you also need to provide the [`tenant_id`](#tenant_id) option.

Behind the scenes, the adapter will do an API call to first find the Workspace ID, and then use that to find the server name.

### `workspace_id`

Example value: `7275c94d-9280-438b-bd67-ffeb8c305c9b`

The ID of your Fabric Workspace. Can be used instead of [`workspace_name`](#workspace_name).

- For `type: fabric`: used to automatically find the `host` value. Not required if `host` is provided (except for Python models).
- For `type: fabricspark`: **required** (unless `workspace_name` is provided). The Lakehouse adapter always needs the workspace.

??? info "Python models (Data Warehouse)"

    If you are using Python models with `type: fabric`, either [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) must be provided.

??? info "auth: ActiveDirectoryServicePrincipal"

    When using this option together with [`authentication`](#authentication) set to `ActiveDirectoryServicePrincipal`, you also need to provide the [`tenant_id`](#tenant_id) option.

Behind the scenes, the adapter will do an API call to first find the server name.

### `authentication` :fontawesome-solid-lock:

Alias: `auth`<br>
Possible values (case insensitive):

- [`ActiveDirectoryIntegrated`](#activedirectoryintegrated)
- [`ActiveDirectoryPassword`](#activedirectorypassword)
- [`ActiveDirectoryServicePrincipal`](#activedirectoryserviceprincipal)
- [`ActiveDirectoryInteractive`](#activedirectoryinteractive)
- [`ActiveDirectoryMsi`](#activedirectorymsi)
- [`auto`](#auto) (default)
- [`CLI`](#cli)
- [`environment`](#environment)
- [`notebookutils`](#notebookutils)
- [`token_credential`](#token_credential)
- [`workload_identity`](#workload_identity)

The adapter supports an authentication method for every use case. The default is `auto`, which will try to use the best available method depending on your environment.

If you can't find a suitable method for your use case, please [open an issue](https://github.com/microsoft/fabric-toolbox/issues).

#### `ActiveDirectoryIntegrated`

Authenticate with a Windows credential federated through Microsoft Entra ID with integrated authentication. This works on domain-joined machines.

??? info "Workspace info and Python models"

    This is not compatible with the [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) options or with Python models. In this case, it's recommended to look at the [`auto`](#auto) or [`CLI`](#cli) options as alternatives.

#### `ActiveDirectoryPassword`

Authenticate with a Microsoft Entra ID username and password. You must provide the [`username`](#username) and [`password`](#password) options.

??? info "Workspace info and Python models"

    This is not compatible with the [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) options or with Python models. In this case, it's recommended to look at the [`auto`](#auto) or [`CLI`](#cli) options as alternatives.

#### `ActiveDirectoryServicePrincipal`

Authenticate with a Microsoft Entra ID service principal using a client ID and client secret. You must provide the [`client_id`](#client_id) and [`client_secret`](#client_secret) options.

??? info "Tenant ID required for Workspace info or Python models"

    If you are using [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id), you also need to provide the [`tenant_id`](#tenant_id) option.

#### `ActiveDirectoryInteractive`

Authenticate with a Microsoft Entra ID username and password using an interactive prompt. You must provide the [`username`](#username) option.

??? info "Workspace info and Python models"

    This is not compatible with the [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) options or with Python models. In this case, it's recommended to look at the [`auto`](#auto) or [`CLI`](#cli) options as alternatives.

#### `ActiveDirectoryMsi`

Authenticate with a managed identity configured in your environment. This is typically used when running in Azure.

??? info "Workspace info and Python models"

    This is not compatible with the [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) options or with Python models. In this case, it's recommended to look at the [`auto`](#auto) or [`CLI`](#cli) options as alternatives.

#### `auto`

**Default authentication method.**

This will try to authenticate using the best available method depending on your environment. It can automatically pick up configurations for managed identities, service principals, Azure CLI/PowerShell users, and more. The full list and order of methods is described on [Microsoft Learn](https://learn.microsoft.com/python/api/azure-identity/azure.identity.defaultazurecredential?view=azure-python).

#### `CLI`

Authenticate using the credentials from the Azure CLI. You must be logged in using `az login`. There have been reports of issues when using an outdated version of the Azure CLI, so make sure to use the latest version. Your account does not need to have access to any Azure subscriptions or resources and the selected Azure subscription does not matter.

Since the Azure CLI supports [a variety of authentication methods](https://learn.microsoft.com/cli/azure/authenticate-azure-cli?view=azure-cli-latest), this is a flexible option that works in many scenarios.

#### `environment`

Authenticate using environment variables. This works similarly to the `auto` method, but only uses environment variables. See [Microsoft Learn](https://learn.microsoft.com/python/api/azure-identity/azure.identity.environmentcredential?view=azure-python) for the list of supported environment variables.

#### `notebookutils`

This authentication method works inside a Fabric notebook. It uses [NotebookUtils](https://learn.microsoft.com/fabric/data-engineering/notebook-utilities) to get an access token for the current user.

!!! warning "Currently broken"

    This method is **not working** at the moment because Microsoft's Runtime in the Notebooks returns a credential with a scope that is not allowed to access Data Warehouses and SQL Endpoints. Use [`environment`](#environment) or [`ActiveDirectoryServicePrincipal`](#activedirectoryserviceprincipal) inside notebooks instead.

#### `workload_identity`

Authenticate with [Workload Identity Federation](https://learn.microsoft.com/entra/workload-id/workload-identity-federation) using a federated OIDC token. No client secret needed. Works with GitHub Actions, Kubernetes, and any OIDC provider. See the [authentication guide](authentication.md#workload-identity-federated-credentials) for examples.

Requires [`tenant_id`](#tenant_id), [`client_id`](#client_id), and exactly one of [`federated_token_url`](#federated_token_url) or [`federated_token_file`](#federated_token_file).

#### `token_credential`

Load any [`azure.core.credentials.TokenCredential`](https://learn.microsoft.com/python/api/azure-core/azure.core.credentials.tokencredential?view=azure-python) implementation by its dotted import path. This is useful when the built-in methods don't cover your scenario -- for example, when using a custom OAuth flow, a token broker, or Workload Identity Federation with a non-standard setup. See the [authentication guide](authentication.md#custom-token-credential) for a full walkthrough.

Requires [`credential_class`](#credential_class). Optionally accepts [`credential_kwargs`](#credential_kwargs).

### `username` :fontawesome-solid-lock:

Aliases: `UID`, `user`<br>
Example value: `satya.nadella@microsoft.com`

The username to use for authentication. This is required if you are using the `ActiveDirectoryPassword` or `ActiveDirectoryInteractive` authentication methods.

### `password` :fontawesome-solid-lock:

Aliases: `PWD`, `pass`<br>
Example value: `IL0veC0p!lot!`

The password to use for authentication. This is required if you are using the `ActiveDirectoryPassword` authentication method.

It's not recommended to hardcode this in your `profiles.yml` file. Instead, [use an environment variable](#example-profilesyml).

### `client_id` :fontawesome-solid-lock:

Alias: `app_id`<br>
Example value: `123e4567-e89b-12d3-a456-426614174000`

The client ID of the Microsoft Entra ID application (service principal) to use for authentication. This is required if you are using the `ActiveDirectoryServicePrincipal` authentication method.

### `client_secret` :fontawesome-solid-lock:

Alias: `app_secret`<br>
Example value: `0123456789abcdef`

The client secret of the Microsoft Entra ID application (service principal) to use for authentication. This is required if you are using the `ActiveDirectoryServicePrincipal` authentication method.

It's not recommended to hardcode this in your `profiles.yml` file. Instead, [use an environment variable](#example-profilesyml).

### `tenant_id` :fontawesome-solid-lock:

Example value: `72f988bf-86f1-41af-91ab-2d7cd011db47`

When `authentication` is set to `ActiveDirectoryServicePrincipal`, the adapter needs to know your Microsoft Entra ID tenant ID to be able to authenticate. This is required if you are using [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) or if you are using Python models.

### `access_token` :fontawesome-solid-lock:

This option overrides all other authentication methods and directly uses the provided access token to authenticate. This can be useful if you want to fully manage the authentication yourself.

??? warning "Token lifetime"

    This is not a recommended way to authenticate, as it requires you to manage the access token yourself. This is only meant for advanced use cases. In normal scenarios, the adapter manages the lifetime of the token for you and will automatically refresh it when needed. In this case, you will need to handle that yourself.

??? warning "Token scope"

    Microsoft accepts multiple token scopes for Fabric. However, if you are using the [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) options or if you are using Python models, the token must have the `https://analysis.windows.net/powerbi/api/.default` scope.

### `token_scope` :fontawesome-solid-lock:

Example values:

- `https://analysis.windows.net/powerbi/api/.default`
- `https://database.windows.net/.default`
- `pbi`
- `DW`

Depending on the [`authentication`](#authentication) method you are using, the adapter will request an access token for a specific scope. This scope will be automatically determined based on your configuration. However, if you need to override the scope for some reason, you can use this option to set a custom scope.

### `credential_class`

Example value: `my_pkg.auth.MyCredential`

The fully qualified dotted import path to a Python class that implements [`azure.core.credentials.TokenCredential`](https://learn.microsoft.com/python/api/azure-core/azure.core.credentials.tokencredential?view=azure-python). This is required when [`authentication`](#authentication) is set to `token_credential`, and must not be set for any other authentication method.

The path must be a valid dotted Python identifier (e.g. `my_pkg.sub.MyCredential`). The class must be importable from the Python environment where dbt runs.

### `credential_kwargs`

Example value:

```yaml
credential_kwargs:
  token_url: "{{ env_var('TOKEN_URL') }}"
  audience: "https://my-api.example.com"
```

A dictionary of keyword arguments passed to the constructor of the class specified in [`credential_class`](#credential_class). This is optional and can only be used when [`authentication`](#authentication) is set to `token_credential`.

### `federated_token_url`

Example value: `https://token.actions.githubusercontent.com`

The URL to fetch a federated OIDC token from. The adapter performs a GET request to this URL and reads the token from the `value` field of the JSON response. Can only be used when [`authentication`](#authentication) is set to `workload_identity`.

Mutually exclusive with [`federated_token_file`](#federated_token_file) — exactly one must be set.

### `federated_token_header`

Example value: `bearer ghs_xxxxxxxxxxxxxxxxxxxx`

The value for the `Authorization` header when fetching the federated token from [`federated_token_url`](#federated_token_url). Can only be used together with `federated_token_url`, not with `federated_token_file`.

### `federated_token_file`

Example value: `/var/run/secrets/azure/tokens/azure-identity-token`

Path to a file containing a federated OIDC token. The adapter re-reads this file each time it needs a fresh token, so external processes (like kubelet) can refresh it. Can only be used when [`authentication`](#authentication) is set to `workload_identity`.

Mutually exclusive with [`federated_token_url`](#federated_token_url) — exactly one must be set.

### `schema_auth`

Alias: `schema_authorization`<br>
Example value: `some_group_or_user`

If your dbt project is using a schema which does not exist yet, dbt will create it for you. Use this configuration option to set the owner of the schema after creation. This can be a user or a group.

### `lakehouse`

Alias: `lakehouse_name`<br>
Example value: `My Lakehouse`

!!! warning "Data Warehouse only"

    This option only applies to `type: fabric`. For `type: fabricspark`, use [`database`](#database) instead — that field specifies your Lakehouse directly.

The name of the Lakehouse in Fabric you wish to use for running [Python models](python-models.md). This is only relevant for Data Warehouse projects that need a Lakehouse as a Spark execution environment for Python models.

When using this option together with [`authentication`](#authentication) set to `ActiveDirectoryServicePrincipal`, you also need to provide the [`tenant_id`](#tenant_id) option.

### `encrypt`

Possible values: `true`, `false`<br>
Default: `true`

Whether to use encryption for the connection. It's recommended to leave this enabled. This could be disabled for advanced networking scenarios.

!!! info "Data Warehouse only"

    This option only applies to `type: fabric`. The FabricSpark adapter connects via HTTPS (Livy API), which is always encrypted.

### `trust_cert`

Alias: `TrustServerCertificate`<br>
Possible values: `true`, `false`<br>
Default: `false`

Whether to trust the server certificate without validation. It's recommended to leave this disabled. This could be enabled for advanced networking scenarios.

!!! info "Data Warehouse only"

    This option only applies to `type: fabric`. The FabricSpark adapter connects via HTTPS (Livy API).

### `retries`

Possible values: any integer<br>
Default: `3`

The number of times to retry a failed connection before failing. This will not rerun a failed query, but will only be used for intermittent connection issues.

### `login_timeout`

Possible values: any integer (seconds) :timer:

The timeout for establishing a connection to the server. This can be useful if you are receiving the `Login timeout expired` error. A value of 30 seconds could improve the connection resiliency. The adapter has no default value and will use the driver's default if not set.

!!! info "Data Warehouse only"

    This option only applies to `type: fabric`. For FabricSpark, see [`spark_session_timeout`](#spark_session_timeout).

### `query_timeout`

Possible values: any integer (seconds) :timer:

The timeout for executing a query.

- For `type: fabric`: this can be useful if you are receiving the `Query timeout expired` error. Default: **86400 seconds (24 hours)**.
- For `type: fabricspark`: controls how long the adapter waits for a Livy statement to complete. Default: **86400 seconds (24 hours)**.

### `lock_timeout`

Possible values: any integer (milliseconds) :timer:<br>
Default: `30000` (30 seconds)

How long a statement waits on a schema lock before failing with `Lock request time out period exceeded`. The adapter issues `SET LOCK_TIMEOUT` on every new connection.

The Fabric Spark&rarr;DW connector used by [Python models](python-models.md) leaves idle JDBC sessions holding a Sch-S lock on the target table for up to the Spark idle-reap window (~25 minutes). Without this cap, a follow-up DDL would stall on the same lock until [`query_timeout`](#query_timeout) (default 24 hours). With the cap the DDL fails fast enough to be visible to the user, who can `dbt build --retry` (or wait for the lock holder to release) instead of hanging.

Set to `0` to skip the `SET LOCK_TIMEOUT` entirely. SQL Server's default of `-1` (wait indefinitely) then applies.

!!! info "Data Warehouse only"

    This option only applies to `type: fabric`.

### `spark_session_timeout`

Possible values: any integer (seconds) :timer:<br>
Default: `900` (15 minutes)

The maximum time to wait for the Livy Spark session to become idle (ready to accept statements). This is relevant during the first statement of a dbt run, when a new session may need to be created.

!!! info "FabricSpark and Python models"

    This option applies to `type: fabricspark` for all Livy session management, and to `type: fabric` when running [Python models](python-models.md) (which also use Livy sessions). For Data Warehouse SQL connection timeouts, see [`login_timeout`](#login_timeout).

### `livy_session_name`

Default: `dbt-fabric`

The name of the Livy session. Sessions are reused across statements within a dbt run. If an existing session with this name is found in an `idle`, `starting`, `running`, or `busy` state, it will be reused instead of creating a new one.

!!! info "Used by both adapter types"

    This option is used by `type: fabricspark` for all SQL execution, and by `type: fabric` for Python model execution.

### `purview_endpoint`

Alias: `purview`<br>
Example value: `https://your-account.purview.azure.com`

The endpoint URL of your Microsoft Purview account. This is required to use the [Purview integration](purview-integration.md).

You can find this in the Azure portal under your Purview account's Properties page (labeled "Atlas endpoint") or in the Purview governance portal settings.

Your authentication identity must have **Data Curator** and **Data Reader** roles in the Purview account's root collection.

### `trace_flag`

Possible values: `true`, `false`<br>
Default: `false`

!!! info "Data Warehouse only"

    This option only applies to `type: fabric`.

Enables SQL connection tracing for debugging purposes. When set to `true`, the underlying database driver logs detailed trace information. This is only useful for diagnosing low-level connection issues and should not be enabled in normal operation.

### `fabric_base_api_uri`

Default: `https://api.fabric.microsoft.com/v1`

!!! warning "Advanced"

    You should not need to change this unless you are connecting to a non-standard Fabric environment (e.g., a sovereign cloud or test endpoint).

The base URL for the Fabric REST API. Used internally for workspace resolution, Livy session management, and Purview integration.

### `powerbi_base_api_uri`

Default: `https://api.powerbi.com/v1.0`

!!! warning "Advanced"

    You should not need to change this unless you are connecting to a non-standard Fabric environment (e.g., a sovereign cloud or test endpoint).

The base URL for the Power BI REST API. Used internally for workspace and server resolution when [`workspace_name`](#workspace_name) or [`workspace_id`](#workspace_id) is provided.

---

## Model-level configuration

These options are set in your `dbt_project.yml` or in individual model `{{ config(...) }}` blocks. They control how dbt materializes your models in Fabric.

### Data Warehouse options

#### `cluster_by`

See the dedicated [CLUSTER BY](cluster-by.md) guide.

#### `statistics`

See the dedicated [Statistics](statistics.md) guide.

#### `auto_provision_aad_principals`

Possible values: `true`, `false`<br>
Default: `false`

When applying [grants](https://docs.getdbt.com/reference/resource-configs/grants), automatically provision Microsoft Entra ID principals (users or groups) if they do not already exist in the Data Warehouse. Without this, granting access to a principal that hasn't logged in yet would fail.

```yaml
models:
  my_project:
    +auto_provision_aad_principals: true
    +grants:
      select: ['data-readers@example.com']
```

### Lakehouse options

#### `file_format`

Default: `delta`

The file format for tables. Only `delta` is supported in Fabric Lakehouse.

#### `partition_by`

Example value: `['year', 'month']`

Columns to partition by. Required for the `insert_overwrite` and `microbatch` incremental strategies.

```sql
{{ config(
    materialized='incremental',
    incremental_strategy='insert_overwrite',
    partition_by=['event_date']
) }}
```

#### `tblproperties`

A dictionary of Spark table properties to set on [materialized views](lakehouse.md) (lake views).

```sql
{{ config(
    materialized='materialized_view',
    tblproperties={'delta.deletedFileRetentionDuration': 'interval 30 days'}
) }}
```

#### `workspace_name` (model config)

Enables cross-workspace 4-part naming for snapshots. Set this to the target workspace name when your snapshot target is in a different workspace than your connection profile.

```sql
{% snapshot my_cross_workspace_snapshot %}
{{ config(
    target_database='other_lakehouse',
    target_schema='dbo',
    workspace_name='Other Workspace',
    strategy='timestamp',
    unique_key='id',
    updated_at='updated_at'
) }}
select * from {{ source('external', 'my_table') }}
{% endsnapshot %}
```
