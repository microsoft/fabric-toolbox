# dbt-fabric

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/dbt-signature_tm_light.png">
  <img alt="dbt logo" src="assets/dbt-signature_tm.png">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/fabric.png">
  <img alt="Fabric logo" src="assets/fabric.png">
</picture>

The dbt adapter for Microsoft Fabric. Supports both Fabric compute engines from a single package, via two adapter types:

- **Fabric Data Warehouse** — T-SQL, uses the [mssql-python](https://github.com/microsoft/mssql-python) driver, no separate ODBC installation required (`type: fabric`)
- **Fabric Lakehouse** — Spark SQL via Livy sessions (`type: fabricspark`)

## Why?

Microsoft Fabric customers using dbt benefit from a single package that covers both compute engines, a comprehensive integration test suite running against real Fabric infrastructure, native support for Microsoft Purview metadata sync, Python models on both engines, and dbt-native implementations of Fabric-specific features (warehouse snapshots, cluster by, manual statistics, external tables via `OPENROWSET`) that plug into dbt's standard hooks, dispatch, and source mechanisms.

## Quick start

### Data Warehouse (T-SQL)

```bash
pip install dbt-fabric dbt-core
```

### Lakehouse (Spark SQL)

```bash
pip install dbt-fabric[spark] dbt-core
```

This installs [dbt-spark](https://github.com/dbt-labs/dbt-spark) as a dependency. See the [Lakehouse guide](docs/lakehouse.md) for configuration and usage.

## Documentation

Full documentation is available at [microsoft.github.io/fabric-toolbox/dbt-fabric/](https://microsoft.github.io/fabric-toolbox/dbt-fabric/).

## Code of Conduct

Everyone interacting in this project's codebases, issues, discussions, and related Slack channels is expected to follow the [dbt Code of Conduct](https://docs.getdbt.com/community/resources/code-of-conduct).

## Acknowledgements

Special thanks to:

* [Sam Debruyn](https://github.com/sdebruyn): primary author of dbt-fabric, who continued active development of the adapter through his fork and contributed this code to the Fabric Toolbox.
* [Jacob Mastel](https://github.com/jacobm001): for his initial work on building dbt-sqlserver.
* [Mikael Ene](https://github.com/mikaelene): for his initial work and continued maintenance on the dbt-sqlserver adapter.
* [Anders Swanson](https://github.com/dataders): for his continued maintenance of the dbt-sqlserver adapter and the creation of the dbt-synapse adapter. And for his work at [dbt Labs](https://www.getdbt.com/).
* [dbt Labs](https://www.getdbt.com/): for their continued support of the dbt open source ecosystem.
* the Microsoft Fabric product team, for their support and contributions to the dbt-fabric adapter.
* every other contributor to dbt-sqlserver, dbt-synapse, and dbt-fabric.
