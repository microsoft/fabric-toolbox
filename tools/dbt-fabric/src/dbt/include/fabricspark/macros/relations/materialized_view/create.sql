{% macro fabricspark__get_create_materialized_view_as_sql(relation, sql) %}
    {%- set partition_by = config.get('partition_by', none) -%}
    {%- set tblproperties = config.get('tblproperties', none) -%}
    {%- set raw_constraints = model['constraints'] -%}

    create or replace materialized lake view {{ relation }}
    {%- if raw_constraints %}
    (
        {%- for constraint in raw_constraints %}
        CONSTRAINT {{ constraint.name }} CHECK ({{ constraint.expression }})
        {%- if constraint.get('on_mismatch') %} ON MISMATCH {{ constraint.get('on_mismatch') }}{% endif %}
        {%- if not loop.last %},{% endif %}
        {%- endfor %}
    )
    {%- endif %}
    {%- if partition_by %}
    PARTITIONED BY ({{ partition_by | join(', ') }})
    {%- endif %}
    {%- if tblproperties %}
    TBLPROPERTIES (
        {%- for key, value in tblproperties.items() %}
        "{{ key }}"="{{ value }}"{% if not loop.last %},{% endif %}
        {%- endfor %}
    )
    {%- endif %}
    AS {{ sql }};
{% endmacro %}