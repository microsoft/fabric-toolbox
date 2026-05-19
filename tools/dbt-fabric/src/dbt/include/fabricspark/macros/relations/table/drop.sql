{% macro fabricspark__drop_table(relation) -%}
    drop table if exists {{ relation.render() }}
{%- endmacro %}