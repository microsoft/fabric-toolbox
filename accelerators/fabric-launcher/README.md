  <p align="center">
  <img src="./docs/Fabric-Launcher.png" alt="Fabric Launcher icon" width="200"/>
</p>

</p>
<p align="center">
<a href="https://badgen.net/github/license/microsoft/fabric-launcher" target="_blank">
    <img src="https://badgen.net/github/license/microsoft/fabric-launcher" alt="license">
</a>
<a href="https://badgen.net/github/releases/microsoft/fabric-launcher" target="_blank">
    <img src="https://badgen.net/github/releases/microsoft/fabric-launcher" alt="releases">
</a>
<a href="https://badgen.net/github/contributors/microsoft/fabric-launcher" target="_blank">
    <img src="https://badgen.net/github/contributors/microsoft/fabric-launcher" alt="contributors">
</a>
<a href="https://badgen.net/github/commits/microsoft/fabric-launcher" target="_blank">
    <img src="https://badgen.net/github/commits/microsoft/fabric-launcher" alt="commits">
</a>
<a href="https://badgen.net/pypi/v/fabric-launcher" target="_blank">
    <img src="https://badgen.net/pypi/v/fabric-launcher" alt="Package version">
</a>
  <a href="https://badgen.net/pypi/dm/fabric-launcher" target="_blank">
    <img src="https://badgen.net/pypi/dm/fabric-launcher" alt="Monthly Downloads">
</a>
</a>
  <a href="https://badge.socket.dev/pypi/package/fabric-launcher?artifact_id=tar-gz" target="_blank">
    <img src="https://badge.socket.dev/pypi/package/fabric-launcher?artifact_id=tar-gz" alt="Socket Badge">
</a>
</p>

---

# Fabric Launcher: From repo to workspace, deploy Fabric solutions effortlessly

A Python library to automate deployment of Microsoft Fabric solutions from GitHub repositories into Fabric workspaces. Fabric-launcher is designed to run within Fabric notebooks. It is ideal for simple, automated deployment for solution accelerators, demos, tutorials, and samples.

**fabric-launcher** is a wrapper around [fabric-cicd](https://github.com/microsoft/fabriccicd) and supports all Fabric item types that fabric-cicd supports.

## Overview

`fabric-launcher` provides a high-level Python interface for orchestrating end-to-end deployment of Microsoft Fabric workspace solutions. It's designed for use within Fabric Python notebooks and simplifies:

- 📥 **Downloading source code** from GitHub repositories
- 🚀 **Deploying artifacts** to Fabric workspaces (all types supported by [fabric-cicd](https://microsoft.github.io/fabric-cicd/0.1.3/))
- 📁 **Uploading files** to Lakehouse Files area
- ▶️ **Triggering notebook execution** for post-deployment tasks

> **Note**: For parameterization, value replacement, and the latest item type compatibility, see the [fabric-cicd documentation](https://microsoft.github.io/fabric-cicd/0.1.3/).

## Installation

```bash
%pip install fabric-launcher
notebookutils.session.restartPython()
```

## Quick Start

```python
import notebookutils
from fabric_launcher import FabricLauncher

# Initialize and deploy
launcher = FabricLauncher(notebookutils)
launcher.download_and_deploy(
    repo_owner="myorg",
    repo_name="my-fabric-solution",
    workspace_folder="workspace"
)
```

### With Configuration File (Recommended)

```python
# Config file in your repo: config/deployment.yaml
launcher = FabricLauncher(
    notebookutils,
    config_repo_owner="myorg",
    config_repo_name="my-solution",
    config_file_path="config/deployment.yaml",
    environment="PROD"
)
launcher.download_and_deploy()
```

### Staged Deployment

```python
launcher.download_and_deploy(
    repo_owner="myorg",
    repo_name="my-solution",
    item_type_stages=[
        ["Lakehouse", "KQLDatabase"],     # Stage 1
        ["Notebook", "Eventstream"],       # Stage 2
        ["SemanticModel", "Report"]        # Stage 3
    ]
)
```

## Examples

See the `examples/` directory for complete working code:

- **[basic_deployment_examples.py](examples/basic_deployment_examples.py)** - Simple deployment workflow
- **[advanced_deployment_examples.py](examples/advanced_deployment_examples.py)** - Configuration files, validation, reporting
- **[staged_deployment_examples.py](examples/staged_deployment_examples.py)** - Multi-stage deployment patterns
- **[accessing_launcher_properties_examples.py](examples/accessing_launcher_properties_examples.py)** - Accessing deployment metadata

## Documentation

- **[Quick Reference](QUICKSTART.md)** - Syntax reference and common operations
- **[Contributing Guide](CONTRIBUTING.md)** - Development setup and guidelines
- **[Changelog](CHANGELOG.md)** - Version history and release notes

## Key Features

✅ **Simple API** - High-level methods abstract complexity  
✅ **Fabric-native** - Designed for Fabric notebooks with `notebookutils`  
✅ **Flexible deployment** - Staged deployment or custom item type selection  
✅ **GitHub integration** - Public and private repository support  
✅ **Configuration management** - YAML/JSON config files with environment overrides  
✅ **Post-deployment validation** - Automatic verification of deployed items  
✅ **Comprehensive reporting** - Deployment tracking and audit trails  

## Supported Item Types

Supports **all fabric-cicd item types**:

**Data:** Lakehouse, KQLDatabase, Eventhouse  
**Compute:** Notebook, Eventstream  
**Analytics:** SemanticModel, Report, KQLDashboard  
**Other:** Reflex, DataAgent, and more

See [fabric-cicd docs](https://microsoft.github.io/fabric-cicd/0.1.3/) for the complete list.

> **Note**: For item types not yet supported by fabric-cicd, use post-deployment notebooks with custom code via `launcher.run_notebook()`.

## Safety Features

By default, `fabric-launcher` validates that the target workspace is empty (except for the current notebook) before deployment to prevent accidentally overwriting existing work.

```python
# Default: validates workspace is empty
launcher = FabricLauncher(notebookutils)
launcher.download_and_deploy(...)  # Blocks if workspace has existing items

# To deploy to non-empty workspace (use with caution)
launcher = FabricLauncher(notebookutils, allow_non_empty_workspace=True)
```

## Main Methods

| Method | Purpose |
|--------|---------|
| `download_and_deploy()` | Download from GitHub and deploy in one operation |
| `download_repository()` | Download repository to local directory |
| `deploy_artifacts()` | Deploy Fabric items from local directory |
| `upload_files_to_lakehouse()` | Upload files to Lakehouse Files area |
| `copy_data_folders_to_lakehouse()` | Copy multiple folders to Lakehouse |
| `run_notebook()` | Execute a Fabric notebook asynchronously |
| `validate_deployment()` | Validate deployed items are accessible |

See [QUICKSTART.md](QUICKSTART.md) for detailed syntax and parameters.

## Post-Deployment Utilities

The `fabric_launcher.post_deployment_utils` module provides utility functions for common post-deployment tasks:

**Item Management:**
- **`get_folder_id_by_name()`** - Find folders by display name
- **`get_item_definition_from_repo()`** - Load item definitions from repository
- **`scan_logical_ids()`** - Map logical IDs to actual workspace IDs
- **`replace_logical_ids()`** - Replace logical IDs in definitions
- **`create_or_update_fabric_item()`** - Generic item creation with logical ID replacement
- **`move_item_to_folder()`** - Organize items into folders

**Eventhouse & KQL Database:**
- **`get_kusto_query_uri()`** - Get Kusto query service URI for an Eventhouse
- **`exec_kql_command()`** - Execute KQL management commands
- **`create_shortcut()`** - Create OneLake shortcuts in Fabric items
- **`create_accelerated_shortcut_in_kql_db()`** - Create shortcuts with accelerated external tables

**SQL Endpoints:**
- **`get_sql_endpoint()`** - Get SQL endpoint connection strings for Lakehouse/Warehouse
- **`exec_sql_query()`** - Execute SQL queries against Fabric SQL endpoints

These helpers are useful for:
- Deploying custom item types not yet supported by fabric-cicd
- Handling cross-item references and logical ID remapping
- Post-deployment organization and configuration
- Eventhouse and KQL Database setup with shortcuts
- SQL-based data validation and queries

See [examples/post_deployment_utils_examples.py](examples/post_deployment_utils_examples.py) for comprehensive usage examples including Eventhouse, KQL Database, and SQL operations.

## Development and Testing

```bash
# Clone the repository
git clone https://github.com/microsoft/fabric-launcher.git
cd fabric-launcher

# Install in development mode
pip install -e .
pip install -r requirements-dev.txt

# Run tests
pytest tests/ -v

# Check code formatting
ruff format fabric_launcher/ tests/
ruff check fabric_launcher/ tests/
```

See [tests/README.md](tests/README.md) for detailed testing documentation.

## Requirements

- Python 3.10, 3.11, or 3.12 (compatible with fabric-cicd dependency)
- Access to Microsoft Fabric workspace
- Running within a Fabric Python notebook (for `notebookutils` access)

**Note**: `semantic-link-sempy` is a runtime dependency that is pre-installed in Fabric notebook environments. For local development or testing outside of Fabric, the package uses mocked versions of these dependencies.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Security

See [SECURITY.md](SECURITY.md) for security policy and reporting vulnerabilities.

