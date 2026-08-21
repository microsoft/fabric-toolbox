{#- Upstream uses LN(). T-SQL has no LN(); LOG() computes natural log by default. #}
{% macro fabric__log_natural(x) %}

    log({{ x }})

{%- endmacro -%}
