{% macro fabric__get_incremental_default_sql(arg_dict) %}

    {% if arg_dict["unique_key"] %}
        {% do return(get_incremental_merge_sql(arg_dict)) %}
    {% else %}
        {% do return(get_incremental_append_sql(arg_dict)) %}
    {% endif %}

{% endmacro %}
