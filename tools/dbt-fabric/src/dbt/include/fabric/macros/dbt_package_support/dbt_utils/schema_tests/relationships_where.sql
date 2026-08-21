{#- Upstream defaults: from_condition="true", to_condition="true". T-SQL has no boolean type. -#}
{% macro fabric__test_relationships_where(model, column_name, to, field, from_condition="1=1", to_condition="1=1") %}

with left_table as (

    select
        {{ column_name }} as id

    from {{ model }}

    where {{ column_name }} is not null
        and {{ from_condition }}

),

right_table as (

    select
        {{ field }} as id

    from {{ to }}

    where {{ field }} is not null
        and {{ to_condition }}

)

select
    left_table.id

from left_table

left join right_table
    on left_table.id = right_table.id

where right_table.id is null

{% endmacro %}
