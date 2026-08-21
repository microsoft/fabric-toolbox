from dataclasses import dataclass

from dbt.adapters.fabric.base_credentials import BaseFabricCredentials


@dataclass
class FabricSparkCredentials(BaseFabricCredentials):
    @property
    def type(self):
        return "fabricspark"

    @property
    def lakehouse_name(self) -> str | None:
        return self.database
