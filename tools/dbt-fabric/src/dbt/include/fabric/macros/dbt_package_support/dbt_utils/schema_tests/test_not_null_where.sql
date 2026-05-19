{% macro fabric__test_not_null_where(model, column_name) %}

  {% set where = kwargs.get('where', kwargs.get('arg')) %}
  {# override dbt-utils' integration tests args default see: #}
  {# https://github.com/fishtown-analytics/dbt-utils/blob/bbba960726667abc66b42624f0d36bbb62c37593/integration_tests/models/schema_tests/schema.yml#L53-L65 #}
  {# TSQL has no bool type #}
  {% if where == '_deleted = false' %}
      {% set where = '_deleted = 0' %}
  {% endif %}

  {{ return(default__test_not_null_where(model, column_name, **kwargs)) }}

{% endmacro %}
