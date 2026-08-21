{% macro fabric__test_not_empty_string(model, column_name, trim_whitespace=true) %}

    with
    
    all_values as (

        select 


            {% if trim_whitespace == true -%}

                trim({{ column_name }}) as {{ column_name }}

            {%- else -%}

                {{ column_name }}

            {%- endif %}
            
        from {{ model }}

    ),

    errors as (

        select * from all_values
        {#- Upstream uses length() = 0. T-SQL LEN() ignores trailing spaces; datalength() is reliable. #}
        where datalength({{ column_name }}) = 0

    )

    select * from errors

{% endmacro %}