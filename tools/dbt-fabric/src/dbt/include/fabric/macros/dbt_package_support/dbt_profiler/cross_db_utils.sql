{# Upstream only checks int/float/numeric/number/double; adds T-SQL types: tinyint, smallint, decimal, money, real #}
{% macro fabric__is_numeric_dtype(dtype) %}
  {% set is_numeric = dtype.startswith("int")
    or dtype.startswith("float")
    or "numeric" in dtype
    or "number" in dtype
    or "double" in dtype
    or "bigint" in dtype
    or "smallint" in dtype
    or "tinyint" in dtype
    or "decimal" in dtype
    or "money" in dtype
    or "real" in dtype %}
  {% do return(is_numeric) %}
{% endmacro %}

{# Upstream only checks bool*; adds T-SQL bit type #}
{% macro fabric__is_logical_dtype(dtype) %}
  {% set is_bool = dtype.startswith("bool") or dtype == "bit" %}
  {% do return(is_bool) %}
{% endmacro %}

{# Upstream only checks timestamp/date; adds T-SQL time and smalldatetime #}
{% macro fabric__is_date_or_time_dtype(dtype) %}
  {% set is_date_or_time = dtype.startswith("date")
    or dtype.startswith("time")
    or dtype == "smalldatetime" %}
  {% do return(is_date_or_time) %}
{% endmacro %}

{# Upstream uses LIMIT 0; T-SQL equivalent is TOP 0 #}
{% macro fabric__assert_relation_exists(relation) %}
  {% do run_query("select top 0 * from " ~ relation) %}
{% endmacro %}
