{% macro fabricspark__drop_materialized_view(relation) -%}
    drop materialized lake view if exists {{ relation }}
{%- endmacro %}