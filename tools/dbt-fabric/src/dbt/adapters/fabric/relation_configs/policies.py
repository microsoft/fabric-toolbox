from dataclasses import dataclass

from dbt_common.dataclass_schema import StrEnum

from dbt.adapters.base.relation import Policy


class FabricRelationType(StrEnum):
    Table = "table"
    View = "view"
    Ephemeral = "ephemeral"
    CTE = "cte"
    Function = "function"


class FabricIncludePolicy(Policy):
    database: bool = True
    schema: bool = True
    identifier: bool = True


@dataclass
class FabricQuotePolicy(Policy):
    database: bool = True
    schema: bool = True
    identifier: bool = True
