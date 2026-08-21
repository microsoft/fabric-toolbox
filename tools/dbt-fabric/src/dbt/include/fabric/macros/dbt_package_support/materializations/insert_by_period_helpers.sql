{% macro get_start_stop_dates(timestamp_field, date_source_models) %}

    {% if config.get('start_date', default=none) is not none %}

        {%- set start_date = config.get('start_date') -%}
        {%- set stop_date = config.get('stop_date', default=none) -%}

        {% do return({'start_date': start_date,'stop_date': stop_date}) %}

    {% elif date_source_models is not none %}

        {% if date_source_models is string %}
            {% set date_source_models = [date_source_models] %}
        {% endif %}
        {% set query_sql %}
            WITH stage AS (
            {% for source_model in date_source_models %}
                SELECT {{ timestamp_field }} FROM {{ ref(source_model) }}
                {% if not loop.last %} UNION ALL {% endif %}
            {% endfor %})

            SELECT MIN({{ timestamp_field }}) AS MIN, MAX({{ timestamp_field }}) AS MAX
            FROM stage
        {% endset %}

        {% set min_max_dict = get_query_results_as_dict(query_sql) %}

        {% set start_date = min_max_dict['MIN'][0] | string %}
        {% set stop_date = min_max_dict['MAX'][0] | string %}
        {% set min_max_dates = {"start_date": start_date, "stop_date": stop_date} %}

        {% do return(min_max_dates) %}

    {% else %}
        {%- if execute -%}
            {{ exceptions.raise_compiler_error("Invalid 'insert_by_period' configuration. Must provide 'start_date' and 'stop_date' and/or 'date_source_models' options.") }}
        {%- endif -%}
    {% endif %}

{% endmacro %}

{% macro check_placeholder(model_sql, placeholder='__PERIOD_FILTER__') %}

    {%- if model_sql.find(placeholder) == -1 -%}
        {%- set error_message -%}
            Model '{{ model.unique_id }}' does not include the required string '__PERIOD_FILTER__' in its sql
        {%- endset -%}
        {{ exceptions.raise_compiler_error(error_message) }}
    {%- endif -%}

{% endmacro %}

{%- macro replace_placeholder_with_period_filter(core_sql, timestamp_field, start_timestamp, stop_timestamp, offset, period) -%}

    {%- set period_filter -%}

            (CAST({{ timestamp_field }} AS DATE) >= DATEADD({{period}}, {{offset}}, CAST('{{ start_timestamp }}' AS DATE)) AND
            CAST({{ timestamp_field }} AS DATE) < DATEADD({{period}}, {{offset}} + 1, CAST('{{ start_timestamp }}' AS DATE))) AND
            (CAST({{ timestamp_field }} AS DATE) >= CAST('{{start_timestamp}}' AS DATE))
    {%- endset -%}

    {%- set filtered_sql = core_sql | replace("__PERIOD_FILTER__", period_filter) -%}

    {% do return(filtered_sql) %}


{%- endmacro %}

{% macro get_period_boundaries(target_schema, target_table, timestamp_field, start_date, stop_date, period) -%}

    {% set period_boundary_sql -%}
        with data as (
            select
                coalesce(max({{ timestamp_field }}), '{{ start_date }}') as start_timestamp,
                coalesce({{ dbt.dateadd('millisecond', 86399999, "nullif('" ~ stop_date | lower ~ "','none')") }},
                         {{ current_timestamp() }} ) as stop_timestamp
            from {{ target_schema }}.{{ target_table }}
        )
        select
            start_timestamp,
            stop_timestamp,
            {{ dbt.datediff('start_timestamp',
                                  'stop_timestamp',
                                  period) }} + 1 as num_periods
        from data
    {%- endset %}

    {% set period_boundaries_dict = get_query_results_as_dict(period_boundary_sql) %}

    {% set period_boundaries = {'start_timestamp': period_boundaries_dict['start_timestamp'][0] | string,
                                'stop_timestamp': period_boundaries_dict['stop_timestamp'][0] | string,
                                'num_periods': period_boundaries_dict['num_periods'][0] | int} %}

    {% do return(period_boundaries) %}
{%- endmacro %}

{%- macro get_period_of_load(period, offset, start_timestamp) -%}

    {% set period_of_load_sql -%}
        SELECT DATEADD({{ period }}, {{ offset }}, CAST('{{start_timestamp}}' AS DATE)) AS period_of_load
    {%- endset %}

    {% set period_of_load_dict = get_query_results_as_dict(period_of_load_sql) %}

    {% set period_of_load = period_of_load_dict['period_of_load'][0] | string %}

    {% do return(period_of_load) %}
{%- endmacro -%}

{%- macro get_period_filter_sql(target_cols_csv, base_sql, timestamp_field, period, start_timestamp, stop_timestamp, offset) -%}

    {%- set filtered_sql = {'sql': base_sql} -%}

    {%- do filtered_sql.update({'sql': replace_placeholder_with_period_filter(filtered_sql.sql,
                                                                                       timestamp_field,
                                                                                       start_timestamp,
                                                                                       stop_timestamp,
                                                                                       offset, period)}) -%}
    {{ filtered_sql.sql }}

{%- endmacro %}
