{#- Override: constructs a Relation object with target.database before dropping.
    T-SQL requires the database context to correctly resolve schema names. -#}
{% macro fabric__drop_schema_by_name(schema_name) %}
    {% set relation = api.Relation.create(database=target.database, schema=schema_name) %}
    {% do drop_schema(relation) %}
{% endmacro %}