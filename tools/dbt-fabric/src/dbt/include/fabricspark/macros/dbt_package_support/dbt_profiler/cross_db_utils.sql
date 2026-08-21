{# Override: default__type_string returns 'varchar'; Spark SQL uses 'string' #}
{%- macro fabricspark__type_string() -%}
  string
{%- endmacro -%}

{# Override: default__assert_relation_exists uses 'select * from ... limit 0' which works,
   but FabricSpark needs backtick quoting. The default already works via adapter.quote(),
   so we only override to avoid potential future issues with the default. #}
{% macro fabricspark__assert_relation_exists(relation) %}
  {% do run_query("select * from " ~ relation ~ " limit 0") %}
{% endmacro %}
