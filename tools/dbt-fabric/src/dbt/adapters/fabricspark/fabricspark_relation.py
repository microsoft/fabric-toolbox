import builtins
from dataclasses import dataclass, field
from typing import Any

from dbt_common.dataclass_schema import StrEnum

from dbt.adapters.base.relation import BaseRelation, InformationSchema
from dbt.adapters.contracts.relation import ComponentName, HasQuoting, Policy, RelationConfig
from dbt.adapters.spark.relation import SparkIncludePolicy, SparkQuotePolicy
from dbt.adapters.utils import classproperty


# SparkQuotePolicy defaults database/schema to False, causing dbt to
# lowercase those components in cache lookups — ApproximateMatchError
# with mixed-case Fabric names. Override to True for case preservation.
@dataclass
class FabricSparkQuotePolicy(SparkQuotePolicy):
    database: bool = True
    schema: bool = True


# SparkIncludePolicy defaults database to False because vanilla Spark
# treats database and schema as synonyms. In Fabric Lakehouse they're
# distinct: database = lakehouse name, schema = schema within it.
# Include database so relations render as 3-part names, which is
# required for cross-lakehouse writes.
@dataclass
class FabricSparkIncludePolicy(SparkIncludePolicy):
    database: bool = True


class FabricSparkRelationType(StrEnum):
    Table = "table"
    View = "view"
    CTE = "cte"
    MaterializedView = "materialized_view"
    Ephemeral = "ephemeral"
    # this is a "catch all" that is better than `None` == external to anything dbt is aware of
    External = "external"
    PointerTable = "pointer_table"
    Function = "function"


@dataclass(frozen=True, eq=False, repr=False)
class FabricSparkRelation(BaseRelation):
    quote_policy: Policy = field(default_factory=lambda: FabricSparkQuotePolicy())
    include_policy: Policy = field(default_factory=lambda: FabricSparkIncludePolicy())
    quote_character: str = "`"
    require_alias: bool = False
    information: str | None = None
    workspace: str | None = None
    replaceable_relations: frozenset[FabricSparkRelationType] = field(
        default_factory=lambda: frozenset(
            {
                FabricSparkRelationType.MaterializedView,
                FabricSparkRelationType.View,
            }
        )
    )
    renameable_relations: frozenset[FabricSparkRelationType] = field(
        default_factory=lambda: frozenset(
            {
                FabricSparkRelationType.MaterializedView,
                FabricSparkRelationType.Table,
            }
        )
    )
    type: FabricSparkRelationType | None = None  # type: ignore

    @classmethod
    def create_from(
        cls,
        quoting: HasQuoting,
        relation_config: RelationConfig,
        **kwargs: Any,
    ) -> "FabricSparkRelation":
        if "workspace" not in kwargs:
            cfg = getattr(relation_config, "config", None)
            if cfg is not None:
                try:
                    ws_name = cfg.get("workspace_name")
                except (AttributeError, TypeError):
                    ws_name = None
                if ws_name:
                    kwargs["workspace"] = ws_name
        return super().create_from(quoting, relation_config, **kwargs)

    @classmethod
    def try_translate_type(cls, relation_type: str | None) -> FabricSparkRelationType | None:
        if relation_type is None:
            return None
        match relation_type.lower():
            case "materialized_lake_view":
                return FabricSparkRelationType.MaterializedView
            case "managed":
                return FabricSparkRelationType.Table
            case "view":
                return FabricSparkRelationType.View
            case _:
                return None

    @classproperty
    def get_relation_type(cls) -> builtins.type[FabricSparkRelationType]:
        return FabricSparkRelationType

    def render(self) -> str:
        base = super().render()
        # Require identifier so that schema-level renders (without_identifier())
        # stay workspace-free — needed for check_schema_exists and local DDL.
        if (
            self.workspace
            and self.identifier
            and self.database
            and self.include_policy.get_part(ComponentName.Database)
            and self.include_policy.get_part(ComponentName.Identifier)
        ):
            quoted_ws = self.quoted(self.workspace)
            return f"{quoted_ws}.{base}" if base else quoted_ws
        return base

    def incorporate(self, **kwargs: Any) -> "FabricSparkRelation":
        if "workspace" not in kwargs:
            kwargs["workspace"] = self.workspace
        return super().incorporate(**kwargs)

    def information_schema(self, view_name=None) -> InformationSchema:
        # some of our data comes from jinja, where things can be `Undefined`.
        if not isinstance(view_name, str):
            view_name = None

        return InformationSchema.from_relation(self, view_name)
