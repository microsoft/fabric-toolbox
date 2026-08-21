from dataclasses import dataclass

from dbt.adapters.protocol import AdapterConfig


@dataclass
class FabricConfigs(AdapterConfig):
    auto_provision_aad_principals: bool | None = False
    cluster_by: str | list[str] | None = None
    statistics: bool | str | list[str] | None = None
    statistics_sample_percent: int | None = None
