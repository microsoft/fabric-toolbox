from dbt.adapters.base.plugin import AdapterPlugin
from dbt.adapters.fabricspark.fabricspark_adapter import FabricSparkAdapter
from dbt.adapters.fabricspark.fabricspark_credentials import FabricSparkCredentials
from dbt.adapters.fabricspark.fabricspark_relation import FabricSparkRelation
from dbt.include import fabricspark

Plugin = AdapterPlugin(
    adapter=FabricSparkAdapter,  # type:ignore
    credentials=FabricSparkCredentials,
    include_path=fabricspark.PACKAGE_PATH,
    dependencies=["spark"],
)

__all__ = ["Plugin", "FabricSparkCredentials", "FabricSparkAdapter", "FabricSparkRelation"]
