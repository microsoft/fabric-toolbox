# Authentication

The dbt-fabric adapter supports a variety of authentication methods so you can connect to Microsoft Fabric from any environment. This guide walks through each method, explains when to use it, and provides ready-to-use `profiles.yml` examples.

!!! info "Works with both adapter types"

    All authentication methods on this page work with both `type: fabric` (Data Warehouse) and `type: fabricspark` (Lakehouse). The examples below use `type: fabric` -- substitute `type: fabricspark` when using the [Lakehouse adapter](lakehouse.md). Note that the FabricSpark adapter does not use the `host` option; it resolves the Livy endpoint from `workspace` or `workspace_id` automatically.

    The full [configuration reference](configuration.md#authentication) lists additional methods (`ActiveDirectoryIntegrated`, `ActiveDirectoryPassword`) that only work with `type: fabric` because they are handled by the mssql-python driver.

!!! tip "Quick recommendation"

    | Scenario | Recommended method |
    | --- | --- |
    | Local development | [`CLI`](#azure-cli) or [`auto`](#automatic-defaultazurecredential) |
    | CI/CD pipelines (OIDC) | [`workload_identity`](#workload-identity-federated-credentials) |
    | CI/CD pipelines (secret) | [`environment`](#environment-variables) or [`ActiveDirectoryServicePrincipal`](#service-principal) |
    | Fabric Notebook | [`environment`](#environment-variables) or [`ActiveDirectoryServicePrincipal`](#service-principal) |
    | Custom token source | [`token_credential`](#custom-token-credential) |

All examples below assume the following base profile structure. Only the authentication-related keys change per method.

```yaml
default:
  target: dev
  outputs:
    dev:
      type: fabric
      workspace: My Workspace
      database: my_data_warehouse
      schema: dbt
      # + authentication keys shown below
```

??? tip "Use environment variables for secrets"

    Never hardcode secrets in your `profiles.yml`. Use Jinja to reference environment variables:

    ```yaml
    client_secret: "{{ env_var('AZURE_CLIENT_SECRET') }}"
    ```

---

## Local development

### Azure CLI

The simplest way to authenticate during local development. Log in once with the Azure CLI and dbt will reuse that session.

**Step 1 — Log in**

```bash
az login
```

Your account does not need access to any Azure subscription — it only needs access to your Fabric workspace.

**Step 2 — Configure your profile**

```yaml
default:
  target: dev
  outputs:
    dev:
      type: fabric
      database: my_data_warehouse
      schema: dbt
      workspace: My Workspace  # or use host
      authentication: CLI
```

!!! info "Keep your Azure CLI up to date"

    There have been reports of issues when using an outdated version of the Azure CLI. Run `az upgrade` to make sure you are on the latest version.

The Azure CLI itself supports [multiple login methods](https://learn.microsoft.com/cli/azure/authenticate-azure-cli?view=azure-cli-latest) (browser, device code, service principal, managed identity, …), making this a flexible option that adapts to many scenarios.

### Automatic (`DefaultAzureCredential`)

Set `authentication` to `auto` (or omit it entirely — it's the default). The adapter uses the Azure Identity SDK's [`DefaultAzureCredential`](https://learn.microsoft.com/python/api/azure-identity/azure.identity.defaultazurecredential?view=azure-python) which tries several credential sources in order:

1. Environment variables
2. Workload identity
3. Managed identity
4. Azure CLI
5. Azure PowerShell
6. Azure Developer CLI
7. Interactive browser (if available)

```yaml
default:
  target: dev
  outputs:
    dev:
      type: fabric
      database: my_data_warehouse
      schema: dbt
      workspace: My Workspace
      # authentication: auto  ← this is the default, can be omitted
```

This means that if you are logged in with **Azure PowerShell** (`Connect-AzAccount`), it will automatically be picked up — no extra configuration needed.

!!! tip "When to use `auto` vs `CLI`"

    `auto` tries multiple credential sources in a chain, which means it can be slightly slower on first connection. It can also pick up credentials you don't intend to use — for example, a managed identity or environment variables left over from another tool. If you know you will always use the Azure CLI, setting `authentication: CLI` explicitly skips the chain, connects faster, and ensures no unexpected credentials are used.

---

## CI/CD & automated environments

### Service Principal

Use a Microsoft Entra ID app registration (service principal) with a client secret. This is ideal for unattended, automated runs.

**Prerequisites:**

- A registered application in Microsoft Entra ID
- The application must have access to your Fabric workspace
- You need the **client ID**, **client secret**, and **tenant ID**

```yaml
default:
  target: ci
  outputs:
    ci:
      type: fabric
      database: my_data_warehouse
      schema: dbt
      workspace: My Workspace
      authentication: ActiveDirectoryServicePrincipal
      tenant_id: "{{ env_var('AZURE_TENANT_ID') }}"
      client_id: "{{ env_var('AZURE_CLIENT_ID') }}"
      client_secret: "{{ env_var('AZURE_CLIENT_SECRET') }}"
```

!!! warning "Tenant ID is required"

    When using `ActiveDirectoryServicePrincipal` together with [`workspace_name`](configuration.md#workspace_name) or [`workspace_id`](configuration.md#workspace_id) — or when running Python models — the `tenant_id` must be provided.

### Environment variables

Set `authentication` to `environment` and configure credentials through environment variables. The adapter uses Azure Identity's [`EnvironmentCredential`](https://learn.microsoft.com/python/api/azure-identity/azure.identity.environmentcredential?view=azure-python), which supports the following variables:

=== "Service principal with secret"

    | Variable | Description |
    | --- | --- |
    | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
    | `AZURE_CLIENT_ID` | Application (client) ID |
    | `AZURE_CLIENT_SECRET` | Client secret |

=== "Service principal with certificate"

    | Variable | Description |
    | --- | --- |
    | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
    | `AZURE_CLIENT_ID` | Application (client) ID |
    | `AZURE_CLIENT_CERTIFICATE_PATH` | Path to a PEM or PKCS12 certificate |
    | `AZURE_CLIENT_CERTIFICATE_PASSWORD` | *(optional)* Certificate password |

=== "Username & password"

    | Variable | Description |
    | --- | --- |
    | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
    | `AZURE_CLIENT_ID` | Application (client) ID |
    | `AZURE_USERNAME` | Username |
    | `AZURE_PASSWORD` | Password |

```yaml
default:
  target: ci
  outputs:
    ci:
      type: fabric
      database: my_data_warehouse
      schema: dbt
      workspace: My Workspace
      authentication: environment
```

This method keeps your `profiles.yml` completely free of secrets, which is an advantage over the explicit `ActiveDirectoryServicePrincipal` method.

### Workload Identity (federated credentials)

Use `workload_identity` to authenticate with [Workload Identity Federation](https://learn.microsoft.com/entra/workload-id/workload-identity-federation) — no client secret needed. The adapter uses [`ClientAssertionCredential`](https://learn.microsoft.com/python/api/azure-identity/azure.identity.clientassertioncredential?view=azure-python) under the hood, fetching a fresh federated token on each Azure token refresh.

This works with any identity provider that issues OIDC tokens: GitHub Actions, Kubernetes, or any custom OIDC endpoint.

**Prerequisites:**

- A registered application in Microsoft Entra ID with a [federated credential](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust?pivots=identity-wif-apps-methods-azp) configured for your identity provider
- The application must have access to your Fabric workspace
- You need the **client ID** and **tenant ID** (no client secret)

=== "GitHub Actions"

    ```yaml
    default:
      target: ci
      outputs:
        ci:
          type: fabric
          database: my_data_warehouse
          schema: dbt
          workspace: My Workspace
          authentication: workload_identity
          tenant_id: "{{ env_var('AZURE_TENANT_ID') }}"
          client_id: "{{ env_var('AZURE_CLIENT_ID') }}"
          federated_token_url: "{{ env_var('ACTIONS_ID_TOKEN_REQUEST_URL') }}&audience=api://AzureADTokenExchange"
          federated_token_header: "bearer {{ env_var('ACTIONS_ID_TOKEN_REQUEST_TOKEN') }}"
    ```

    Your workflow needs `permissions: id-token: write` to make the OIDC token endpoint available.

=== "Kubernetes"

    ```yaml
    default:
      target: ci
      outputs:
        ci:
          type: fabric
          database: my_data_warehouse
          schema: dbt
          workspace: My Workspace
          authentication: workload_identity
          tenant_id: "{{ env_var('AZURE_TENANT_ID') }}"
          client_id: "{{ env_var('AZURE_CLIENT_ID') }}"
          federated_token_file: /var/run/secrets/azure/tokens/azure-identity-token
    ```

    The kubelet automatically refreshes the token file, and the adapter re-reads it on each Azure token refresh.

!!! info "No client secret required"

    Unlike `ActiveDirectoryServicePrincipal`, this method does not need a `client_secret`. Authentication is based on the trust relationship between Microsoft Entra ID and your identity provider's OIDC tokens.

!!! tip "Token lifetime"

    The adapter automatically refreshes Azure access tokens (valid ~60-90 minutes) by calling the federated token source again. This works for long-running jobs — the GitHub Actions request token stays valid for the entire job duration (up to 6 hours).

---

## Fabric Notebook

When running dbt inside a **Fabric Notebook**, the recommended approach is to use **environment variable** or **service principal** authentication.

Configure your notebook to set the required environment variables (e.g. `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) and use the [`environment`](#environment-variables) or [`ActiveDirectoryServicePrincipal`](#service-principal) method.

```yaml
default:
  target: notebook
  outputs:
    notebook:
      type: fabric
      database: my_data_warehouse
      schema: dbt
      workspace: My Workspace
      authentication: environment
```

Alternatively, with explicit service principal configuration:

```yaml
default:
  target: notebook
  outputs:
    notebook:
      type: fabric
      database: my_data_warehouse
      schema: dbt
      workspace: My Workspace
      authentication: ActiveDirectoryServicePrincipal
      tenant_id: "{{ env_var('AZURE_TENANT_ID') }}"
      client_id: "{{ env_var('AZURE_CLIENT_ID') }}"
      client_secret: "{{ env_var('AZURE_CLIENT_SECRET') }}"
```

!!! warning "`notebookutils` is currently broken"

    The adapter also has a `notebookutils` authentication method that uses [NotebookUtils](https://learn.microsoft.com/fabric/data-engineering/notebook-utilities) to obtain an access token from the notebook session. However, this method is **not working** at the moment because Microsoft's Runtime in the Notebooks returns a credential with a scope that is not allowed to access Data Warehouses and SQL Endpoints. Use one of the alternatives above instead.

---

## Custom token credential

### Bring your own `TokenCredential`

If the built-in authentication methods don't cover your scenario, you can supply any class that implements the [`azure.core.credentials.TokenCredential`](https://learn.microsoft.com/python/api/azure-core/azure.core.credentials.tokencredential?view=azure-python) protocol. The adapter loads the class by its dotted import path at runtime and calls `get_token()` whenever it needs an access token.

This is useful when:

- Your organization uses a custom OAuth flow or token broker
- You need Workload Identity Federation with a non-standard setup
- A desktop tool already has its own credential and you want to pass it through
- You want to wrap an existing credential with custom logging or caching

**Step 1 -- Implement a `TokenCredential`**

Your class must implement the `get_token` method from the `azure.core.credentials.TokenCredential` protocol:

```python
# my_pkg/auth.py
from azure.core.credentials import AccessToken, TokenCredential


class MyCredential(TokenCredential):
    def __init__(self, token_url: str, **kwargs):
        self.token_url = token_url

    def get_token(self, *scopes, **kwargs) -> AccessToken:
        # Your custom logic to acquire a token
        ...
```

**Step 2 -- Configure your profile**

```yaml
default:
  target: dev
  outputs:
    dev:
      type: fabric
      database: my_data_warehouse
      schema: dbt
      workspace: My Workspace
      authentication: token_credential
      credential_class: "my_pkg.auth.MyCredential"
      credential_kwargs:
        token_url: "{{ env_var('TOKEN_URL') }}"
```

The `credential_class` must be a fully qualified dotted path to an importable Python class. The `credential_kwargs` dictionary is passed as keyword arguments to the class constructor.

!!! warning "The credential class must be importable"

    The class specified in `credential_class` must be importable from the Python environment where dbt runs. Make sure the package is installed (e.g. `pip install my_pkg`) or that the module is on the Python path.

!!! info "Configuration reference"

    See [`credential_class`](configuration.md#credential_class) and [`credential_kwargs`](configuration.md#credential_kwargs) for details on validation rules and allowed values.

---

## Other methods

The adapter supports several additional authentication methods such as managed identity, interactive browser, and pre-acquired access tokens. For a complete list of all supported methods and their configuration options, see the [configuration documentation](configuration.md#authentication).

---

## Troubleshooting

### Which authentication method is being used?

Run `dbt debug` to see the resolved connection information, including the active authentication method.

```bash
dbt debug
```

### Common issues

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Login timeout expired` | Slow network or restrictive firewall | Increase [`login_timeout`](configuration.md#login_timeout) (e.g. `30`) |
| `AADSTS700016: Application not found` | Wrong `client_id` or the app isn't registered in the correct tenant | Verify the app registration in Microsoft Entra ID |
| `DefaultAzureCredential failed` | No valid credential source found | Make sure you are logged in (`az login` / `Connect-AzAccount`) or that environment variables are set |
| `Token expired` when using `access_token` | The pre-acquired token has expired | Refresh the token before running dbt |
| `notebookutils not found` | Using `notebookutils` auth outside of a Fabric notebook | Switch to a different authentication method |
