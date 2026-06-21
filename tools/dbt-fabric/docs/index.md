# dbt-fabric

![dbt logo for light mode](assets/dbt-signature_tm.png#gh-light-mode-only)
![dbt logo for dark mode](assets/dbt-signature_tm_light.png#gh-dark-mode-only)
![fabric logo](assets/fabric.png)

The dbt adapter for Microsoft Fabric. Supports both Fabric compute engines from a single package, via two adapter types:

- **Fabric Data Warehouse** — T-SQL, uses the [mssql-python](https://github.com/microsoft/mssql-python) driver, no separate ODBC installation required (`type: fabric`)
- **Fabric Lakehouse** — Spark SQL via Livy sessions (`type: fabricspark`)

For a tour of what's in this adapter, see the [Features](features.md) page. For installation steps, head to the [Installation guide](installation.md).

## Quick start

```bash
pip install dbt-fabric dbt-core
```

For the Lakehouse adapter:

```bash
pip install dbt-fabric[spark] dbt-core
```
