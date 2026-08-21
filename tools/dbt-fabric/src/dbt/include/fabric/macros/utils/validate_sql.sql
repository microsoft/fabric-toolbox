{% macro fabric__validate_sql(sql) -%}
  {% call statement('set_showplan_on') -%}
    SET SHOWPLAN_XML ON;
  {% endcall %}
  {% call statement('run_sql') -%}
    {{ sql }}
  {% endcall %}
  {% call statement('set_showplan_off') -%}
    SET SHOWPLAN_XML OFF;
  {% endcall %}
  {{ return(load_result('run_sql')) }}
{% endmacro %}