{# Override: default__get_profile uses INFORMATION_SCHEMA.COLUMNS which doesn't exist in
   Spark SQL. Delegates to dbt-profiler's databricks__get_profile which uses DESCRIBE TABLE
   EXTENDED instead — functionally identical for FabricSpark. #}
{% macro fabricspark__get_profile(relation, exclude_measures=[], include_columns=[], exclude_columns=[], where_clause=none, group_by=[]) %}
  {{ return(dbt_profiler.databricks__get_profile(relation, exclude_measures, include_columns, exclude_columns, where_clause, group_by)) }}
{% endmacro %}
