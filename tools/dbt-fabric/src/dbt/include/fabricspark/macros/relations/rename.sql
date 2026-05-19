{% macro fabricspark__rename_relation(from_relation, to_relation) -%}
  {% call statement('rename_relation') -%}
    {{ get_rename_sql(from_relation, to_relation) }}
  {%- endcall %}
{% endmacro %}