{#- Override: uses SELECT TOP 1 WITH TIES + ORDER BY ROW_NUMBER() instead of a CTE with
    ROW_NUMBER() = 1. T-SQL's TOP WITH TIES avoids adding a synthetic row_number column. -#}
{%- macro fabric__deduplicate(relation, partition_by, order_by) -%}

    select top 1 with ties
        *
    from {{ relation }}
    order by row_number() over (
        partition by {{ partition_by }}
        order by {{ order_by }}
    )

{%- endmacro -%}
