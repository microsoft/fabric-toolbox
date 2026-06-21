from dbt.adapters.base import AdapterPlugin
from dbt.adapters.fabric.fabric_adapter import FabricAdapter
from dbt.adapters.fabric.fabric_api_client import FabricApiClient
from dbt.adapters.fabric.fabric_column import FabricColumn
from dbt.adapters.fabric.fabric_configs import FabricConfigs
from dbt.adapters.fabric.fabric_connection_manager import FabricConnectionManager
from dbt.adapters.fabric.fabric_credentials import FabricCredentials
from dbt.adapters.fabric.fabric_livy_helper import FabricLivyHelper
from dbt.adapters.fabric.fabric_relation import FabricRelation
from dbt.adapters.fabric.fabric_token_provider import FabricTokenProvider
from dbt.adapters.fabric.purview_client import PurviewClient
from dbt.adapters.fabric.purview_sync import PurviewSync
from dbt.include import fabric

Plugin = AdapterPlugin(
    adapter=FabricAdapter,
    credentials=FabricCredentials,
    include_path=fabric.PACKAGE_PATH,
)

__all__ = [
    "FabricAdapter",
    "FabricApiClient",
    "FabricColumn",
    "FabricConfigs",
    "FabricConnectionManager",
    "FabricCredentials",
    "FabricLivyHelper",
    "FabricRelation",
    "FabricTokenProvider",
    "Plugin",
    "PurviewClient",
    "PurviewSync",
]
