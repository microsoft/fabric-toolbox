import builtins
from dataclasses import dataclass, field

from dbt.adapters.base.relation import BaseRelation
from dbt.adapters.fabric.relation_configs import FabricQuotePolicy, FabricRelationType
from dbt.adapters.utils import classproperty


@dataclass(frozen=True, eq=False, repr=False)
class FabricRelation(BaseRelation):
    type: FabricRelationType | None = None  # type: ignore
    quote_policy: FabricQuotePolicy = field(default_factory=lambda: FabricQuotePolicy())
    require_alias: bool = True

    def quoted(self, identifier):
        return "[{}]".format(identifier.replace("]", "]]"))

    @classproperty
    def get_relation_type(cls) -> builtins.type[FabricRelationType]:
        return FabricRelationType

    def render_limited(self) -> str:
        rendered = self.render()
        if self.limit is None:
            return rendered
        elif self.limit == 0:
            return f"(select * from {rendered} where 1=0) AS {self._render_limited_alias()}"
        else:
            return f"(select TOP {self.limit} * from {rendered}) AS {self._render_limited_alias()}"
