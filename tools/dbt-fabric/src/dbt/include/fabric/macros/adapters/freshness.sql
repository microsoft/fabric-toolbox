{% macro fabric__collect_freshness(source, loaded_at_field, filter) %}
  {% call statement('collect_freshness', fetch_result=True, auto_begin=False) -%}
    select
      max(TRY_CAST({{ loaded_at_field }} AS datetimeoffset(6))) as max_loaded_at,
      SYSDATETIMEOFFSET() as snapshotted_at
    from {{ source }}
    {% if filter %}
    where {{ filter }}
    {% endif %}
  {%- endcall %}
  {{ return(load_result('collect_freshness')) }}
{% endmacro %}
