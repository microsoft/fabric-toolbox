from collections.abc import Callable, Iterable
from concurrent.futures import Future, as_completed
from typing import TYPE_CHECKING

from dbt_common.clients.agate_helper import DEFAULT_TYPE_TESTER
from dbt_common.events.functions import warn_or_error
from dbt_common.exceptions import DbtRuntimeError
from dbt_common.utils.dict import AttrDict
from dbt_common.utils.executor import executor

from dbt.adapters.base.impl import BaseAdapter
from dbt.adapters.capability import Capability, CapabilityDict, CapabilitySupport, Support
from dbt.adapters.contracts.relation import RelationConfig
from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.events.types import (
    CatalogGenerationError,
)
from dbt.adapters.fabric.base_fabric_adapter import BaseFabricAdapter
from dbt.adapters.fabricspark.fabricspark_column import FabricSparkColumn
from dbt.adapters.fabricspark.fabricspark_connection_manager import FabricSparkConnectionManager
from dbt.adapters.fabricspark.fabricspark_relation import (
    FabricSparkRelation,
    FabricSparkRelationType,
)
from dbt.adapters.spark.impl import SparkAdapter
from dbt.adapters.sql.impl import LIST_SCHEMAS_MACRO_NAME

if TYPE_CHECKING:
    import agate

logger = AdapterLogger("FabricSpark")


class FabricSparkAdapter(BaseFabricAdapter, SparkAdapter):
    Column = FabricSparkColumn
    ConnectionManager = FabricSparkConnectionManager  # type: ignore
    connections: FabricSparkConnectionManager  # type: ignore
    Relation = FabricSparkRelation
    RelationInfo = tuple[str, str, str]

    _capabilities: CapabilityDict = CapabilityDict(
        {
            Capability.TableLastModifiedMetadata: CapabilitySupport(support=Support.Full),
            Capability.SchemaMetadataByRelations: CapabilitySupport(support=Support.Full),
        }
    )

    def _namespace_to_parts(self, namespace: str) -> tuple[str, str, str]:
        """Convert a namespace string into its components."""
        # Example namespace: `adapter-dev`.`dbtdevlh`.`test17722693981743727771_test_basic`
        parts = tuple(x.strip("`") for x in namespace.split("."))
        if len(parts) != 3:
            raise DbtRuntimeError(
                f"Unexpected namespace format: '{namespace}'. "
                f"Expected format: 'workspace.database.schema'"
            )
        return parts

    def _build_spark_relation_list(
        self,
        row_list: "agate.Table",
        relation_info_func: Callable[["agate.Row"], RelationInfo],
    ) -> list[FabricSparkRelation]:
        relations = []
        for row in row_list:
            _namespace, name, information = relation_info_func(row)
            if _namespace is None or _namespace == "":
                continue  # temporary view

            _workspace, _database, _schema = self._namespace_to_parts(_namespace)

            # Example information string:
            # Catalog: spark_catalog  # noqa: ERA001
            # Database: `adapter-dev`.`dbtdevlh`.`test17722693981743727771_test_basic`
            # Table: table_model  # noqa: ERA001
            # Created Time: Wed Jan 21 12:17:49 UTC 1970
            # Last Access: UNKNOWN
            # Created By: Spark
            # Type: MANAGED  # noqa: ERA001
            # Provider: delta  # noqa: ERA001
            # Comment: ...  # noqa: ERA001
            # Table Properties: [key=value, ...]
            # Location: abfss://...

            # 3 possible types: MATERIALIZED_LAKE_VIEW, VIEW, or MANAGED (regular table)

            if "Type: MATERIALIZED_LAKE_VIEW" in information:
                rel_type = FabricSparkRelationType.MaterializedView
            elif "Type: VIEW" in information:
                rel_type = FabricSparkRelationType.View
            else:
                rel_type = FabricSparkRelationType.Table

            relation: FabricSparkRelation = self.Relation.create(
                catalog=_workspace,
                database=_database,
                schema=_schema,
                identifier=name,
                type=rel_type,
                information=information,
            )
            relations.append(relation)

        return relations

    def list_relations_without_caching(
        self, schema_relation: FabricSparkRelation
    ) -> list[FabricSparkRelation]:
        try:
            return super().list_relations_without_caching(schema_relation)
        except DbtRuntimeError as e:
            errmsg = getattr(e, "msg", "")
            if "[SCHEMA_NOT_FOUND]" in errmsg:
                return []
            raise

    def get_relation(
        self, database: str, schema: str, identifier: str
    ) -> FabricSparkRelation | None:
        return BaseAdapter.get_relation(self, database, schema, identifier)

    def parse_describe_extended(
        self, relation: FabricSparkRelation, raw_rows: AttrDict
    ) -> list[FabricSparkColumn]:
        # Convert the Row to a dict
        dict_rows = [dict(zip(row._keys, row._values, strict=False)) for row in raw_rows]
        # Find the separator between the rows and the metadata provided
        # by the DESCRIBE TABLE EXTENDED statement
        pos = self.find_table_information_separator(dict_rows)

        # Remove rows that start with a hash, they are comments
        rows = [row for row in raw_rows[0:pos] if not row["col_name"].startswith("#")]
        metadata = {col["col_name"]: col["data_type"] for col in raw_rows[pos + 1 :]}

        table_comment = metadata.get("Comment") or None

        return [
            FabricSparkColumn(
                table_catalog=relation.catalog,
                table_database=relation.database,
                table_schema=relation.schema,
                table_name=relation.name,
                table_type=FabricSparkRelation.try_translate_type(metadata.get("Type"))
                or relation.type,
                table_comment=table_comment,
                column=column["col_name"],
                column_index=idx,
                dtype=column["data_type"],
                column_comment=column.get("comment") or None,
            )
            for idx, column in enumerate(rows)
        ]

    def list_schemas(self, database: str) -> list[str]:
        results = self.execute_macro(LIST_SCHEMAS_MACRO_NAME, kwargs={"database": database})
        return [self._namespace_to_parts(row[0])[-1] for row in results]

    def get_catalog(
        self,
        relation_configs: Iterable[RelationConfig],
        used_schemas: frozenset[tuple[str, str]],
    ) -> tuple["agate.Table", list[Exception]]:

        # First, we convert the relation configs into namespace relations
        configs_as_relations = self._get_catalog_relations(relation_configs)
        namespace_tuples = {
            (relation.catalog, relation.database, relation.schema)
            for relation in configs_as_relations
        }
        namespace_relations = {
            FabricSparkRelation.create(catalog=catalog, database=database, schema=schema)
            for catalog, database, schema in namespace_tuples
        }

        # Second, we gather all relations in in every namespace in parallel
        all_relations: set[FabricSparkRelation] = set()
        exceptions: list[Exception] = []

        with executor(self.config) as tpe:
            relation_futures: list[Future[list[FabricSparkRelation]]] = []

            for namespace_relation in namespace_relations:
                relation_futures.append(
                    tpe.submit_connected(
                        self,
                        str(namespace_relation),
                        self.list_relations_without_caching,
                        namespace_relation,
                    )
                )

            for future in as_completed(relation_futures):
                exc = future.exception()
                # we want to re-raise on ctrl+c and BaseException
                if exc is None:
                    relations = future.result()
                    all_relations.update(relations)
                elif isinstance(exc, KeyboardInterrupt) or not isinstance(exc, Exception):
                    raise exc
                else:
                    warn_or_error(CatalogGenerationError(exc=str(exc)))
                    # exc is not None, derives from Exception, and isn't ctrl+c
                    exceptions.append(exc)

        catalogs, c_exceptions = self.get_catalog_by_relations(used_schemas, all_relations)
        exceptions.extend(c_exceptions)
        return catalogs, exceptions

    def get_catalog_by_relations(
        self, used_schemas: frozenset[tuple[str, str]], relations: set[FabricSparkRelation]
    ) -> tuple["agate.Table", list[Exception]]:
        exceptions: list[Exception] = []
        all_columns: list[FabricSparkColumn] = []

        with executor(self.config) as tpe:
            columns_futures: list[Future[list[FabricSparkColumn]]] = []
            for relation in relations:
                columns_futures.append(
                    tpe.submit_connected(
                        self,
                        str(relation),
                        self.get_columns_in_relation,
                        relation,
                    )
                )

            for future in as_completed(columns_futures):
                exc = future.exception()
                # we want to re-raise on ctrl+c and BaseException
                if exc is None:
                    columns: list[FabricSparkColumn] = future.result()
                    all_columns.extend(columns)
                elif isinstance(exc, KeyboardInterrupt) or not isinstance(exc, Exception):
                    raise exc
                else:
                    warn_or_error(CatalogGenerationError(exc=str(exc)))
                    # exc is not None, derives from Exception, and isn't ctrl+c
                    exceptions.append(exc)

        # Convert columns into an agate table and return with any exceptions
        columns_as_dicts = []
        for column in all_columns:
            as_dict = column.to_column_dict()
            as_dict["column_name"] = as_dict.pop("column", None)
            as_dict["column_type"] = as_dict.pop("dtype")
            columns_as_dicts.append(as_dict)

        import agate

        columns_as_table = agate.Table.from_object(
            columns_as_dicts, column_types=DEFAULT_TYPE_TESTER
        )
        return columns_as_table, exceptions
