# Compatibility

The adapter version (`1.X.Y`) is tested and guaranteed against the matching dbt-core minor version (`1.X.*`). This follows the dbt ecosystem convention where the adapter major and minor versions track the dbt-core release that they target.

## dbt-core

| dbt-core version | Supported |
|---|---|
| 1.9 | Yes |
| 1.10 | Yes |
| 1.11 | Yes |
| 1.12 | Yes |

## Python

| Python version | Supported |
|---|---|
| 3.11 | Yes |
| 3.12 | Yes |
| 3.13 | Yes |

## SQL Server driver

This adapter uses [`mssql-python`](https://github.com/microsoft/mssql-python), Microsoft's official Python driver for SQL Server and Fabric. It bundles the Microsoft ODBC Driver 18 for SQL Server and unixODBC directly in the Python package, so no ODBC drivers or system-level dependencies need to be installed separately. Installation is a single `pip install` command on Linux, macOS, and Windows.

## Fabric compute types

| Compute type | Adapter type | SQL dialect |
|---|---|---|
| Fabric Data Warehouse | `fabric` | T-SQL |
| Fabric Lakehouse | `fabricspark` | Spark SQL |

The `fabricspark` adapter type requires the optional `spark` dependency: `pip install dbt-fabric[spark]`.
