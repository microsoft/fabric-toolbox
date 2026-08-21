{% macro fabricspark__drop_relation(relation) -%}
  {% call statement('drop_relation', auto_begin=False) -%}
      drop {{ relation.type if relation.type != "materialized_view" else "materialized lake view" }} if exists {{ relation }}
  {%- endcall %}
{% endmacro %}