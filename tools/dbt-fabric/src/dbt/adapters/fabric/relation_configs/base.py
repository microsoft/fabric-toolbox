from dataclasses import dataclass
from typing import Any

import agate

from dbt.adapters.base.relation import Policy
from dbt.adapters.contracts.relation import RelationConfig
from dbt.adapters.fabric.relation_configs.policies import FabricIncludePolicy, FabricQuotePolicy
from dbt.adapters.relation_configs import RelationConfigBase, RelationResults


@dataclass(frozen=True, eq=True, unsafe_hash=True)
class FabricRelationConfigBase(RelationConfigBase):
    """Base class with boilerplate methods and light structure for Fabric relations."""

    @classmethod
    def include_policy(cls) -> Policy:
        return FabricIncludePolicy()

    @classmethod
    def quote_policy(cls) -> Policy:
        return FabricQuotePolicy()

    @classmethod
    def from_relation_config(cls, relation_config: RelationConfig):
        relation_config_dict = cls.parse_relation_config(relation_config)
        relation = cls.from_dict(relation_config_dict)
        return relation

    @classmethod
    def parse_relation_config(cls, relation_config: RelationConfig) -> dict:
        raise NotImplementedError(
            "`parse_relation_config()` needs to be implemented on this RelationConfigBase instance"
        )

    @classmethod
    def from_relation_results(cls, relation_results: RelationResults):
        relation_config = cls.parse_relation_results(relation_results)
        relation = cls.from_dict(relation_config)
        return relation  # type: ignore

    @classmethod
    def parse_relation_results(cls, relation_results: RelationResults) -> dict[str, Any]:
        raise NotImplementedError(
            "`parse_relation_results()` needs to be implemented "
            "on this RelationConfigBase instance"
        )

    @classmethod
    def _get_first_row(cls, results: agate.Table) -> agate.Row:
        try:
            return results.rows[0]
        except IndexError:
            return agate.Row(values=set())
