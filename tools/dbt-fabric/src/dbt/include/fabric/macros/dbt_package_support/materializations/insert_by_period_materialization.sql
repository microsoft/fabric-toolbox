
{% materialization insert_by_period, adapter = 'fabric' -%}

    {%- set full_refresh_mode = flags.FULL_REFRESH -%}

    {%- set target_relation = this -%}
    {%- set existing_relation = load_relation(this) -%}
    {%- set tmp_relation = make_temp_relation(this) -%}

    {%- set target_relation = api.Relation.create(
        database = target_relation.database,
        schema = target_relation.schema,
        identifier = target_relation.identifier,
        type = 'table'
    ) -%}



    {%- set timestamp_field = config.require('timestamp_field') -%}
    {%- set date_source_models = config.get('date_source_models', default=none) -%}
    {%- set unique_key = config.get('unique_key', default=none) -%}

    {%- set start_stop_dates = get_start_stop_dates(timestamp_field, date_source_models) | as_native -%}

    {%- set period = config.get('period', default='day') -%}

    {%- set to_drop = [] -%}

    {%- do check_placeholder(sql) -%}

    {{ run_hooks(pre_hooks, inside_transaction=False) }}

    -- `BEGIN` happens here:
    {{ run_hooks(pre_hooks, inside_transaction=True) }}

    {% if existing_relation is none %}

        {% set filtered_sql = replace_placeholder_with_period_filter(sql, timestamp_field,
                                                                       start_stop_dates.start_date,
                                                                       start_stop_dates.stop_date,
                                                                       0, period) %}
        {% set build_sql = create_table_as(False, target_relation, filtered_sql) %}

        {% do to_drop.append(tmp_relation) %}

    {% elif existing_relation.is_view or full_refresh_mode %}
        {#-- Make sure the backup doesn't exist so we don't encounter issues with the rename below #}
        {% set backup_identifier = existing_relation.identifier ~ "__dbt_backup" %}
        {% set backup_relation = existing_relation.incorporate(path={"identifier": backup_identifier}) %}

        {% do adapter.drop_relation(backup_relation) %}
        {% do adapter.rename_relation(target_relation, backup_relation) %}

        {% set filtered_sql = replace_placeholder_with_period_filter(sql, timestamp_field,
                                                                       start_stop_dates.start_date,
                                                                       start_stop_dates.stop_date,
                                                                       0, period) %}
        {% set build_sql = create_table_as(False, target_relation, filtered_sql) %}

        {% do to_drop.append(tmp_relation) %}
        {% do to_drop.append(backup_relation) %}
    {% else %}

        {% set period_boundaries = get_period_boundaries(schema,
                                                                  target_relation.name,
                                                                  timestamp_field,
                                                                  start_stop_dates.start_date,
                                                                  start_stop_dates.stop_date,
                                                                  period) %}

        {% set target_columns = adapter.get_columns_in_relation(target_relation) %}
        {%- set target_cols_csv = target_columns | map(attribute='quoted') | join(', ') -%}
        {%- set loop_vars = {'sum_rows_inserted': 0} -%}

        {% for i in range(1, period_boundaries.num_periods) -%}

            {%- set iteration_number = i + 1 -%}
            {%- set period_of_load = get_period_of_load(period, i, period_boundaries.start_timestamp) -%}

            {{ log_info("Running for {} {} of {} ({}) [{}]".format(period, iteration_number, period_boundaries.num_periods, period_of_load, model.unique_id)) }}

            {%- set tmp_identifier = target_relation.identifier ~ '__dbt_incremental_period' ~ i ~ '_tmp' -%}
            {%- set tmp_relation = api.Relation.create(
                                               identifier=tmp_identifier,
                                                database = target_relation.database,
                                                schema = target_relation.schema, 
                                               type='table') -%}


            {% set tmp_table_sql = get_period_filter_sql(target_cols_csv, sql, timestamp_field, period,
                                                                  period_boundaries.start_timestamp,
                                                                  period_boundaries.stop_timestamp, i) %}

            {% call statement() -%}
                {{ create_table_as(True, tmp_relation, tmp_table_sql) }}
            {%- endcall %}

            {{ adapter.expand_target_column_types(from_relation=tmp_relation,
                                                  to_relation=target_relation) }}

            {%- set insert_query_name = 'main-' ~ i -%}
            {% call statement(insert_query_name, fetch_result=True) -%}

                {%- if unique_key is not none -%}
                delete
                from {{ target_relation }}
                where ({{ unique_key }}) in (
                    select ({{ unique_key }})
                    from {{ tmp_relation }}
                );
                {%- endif %}    

                insert into {{ target_relation }} ({{ target_cols_csv }})
                (
                    select {{ target_cols_csv }}
                    from {{ tmp_relation.include(schema=True) }}
                );
            {%- endcall %}

            {% set result = load_result(insert_query_name) %}

            {% if 'response' in result.keys() %} {# added in v0.19.0 #}
                {% set rows_inserted = result['response']['rows_affected'] %}
            {% else %} {# older versions #}
                {% set rows_inserted = result['status'].split(" ")[2] | int %}
            {% endif %}

            {%- set sum_rows_inserted = loop_vars['sum_rows_inserted'] + rows_inserted -%}
            {%- do loop_vars.update({'sum_rows_inserted': sum_rows_inserted}) %}

            {{ log_info("Ran for {} {} of {} ({}); {} records inserted [{}]".format(period, iteration_number,
                                                                                              period_boundaries.num_periods,
                                                                                              period_of_load, rows_inserted,
                                                                                              model.unique_id)) }}

            {% do to_drop.append(tmp_relation) %}
            {% do adapter.commit() %}

        {% endfor %}

        {% call noop_statement('main', "INSERT {}".format(loop_vars['sum_rows_inserted']) ) -%}
            {{ tmp_table_sql }}
        {%- endcall %}

    {% endif %}

    {% if build_sql is defined %}
        {% call statement("main", fetch_result=True) %}
            {{ build_sql }}
        {% endcall %}

        {% set result = load_result('main') %}

        {% if 'response' in result.keys() %} {# added in v0.19.0 #}
            {% set rows_inserted = result['response']['rows_affected'] %}
        {% else %} {# older versions #}
            {% set rows_inserted = result['status'].split(" ")[2] | int %}
        {% endif %}

        {% call noop_statement('main', "BASE LOAD {}".format(rows_inserted)) -%}
            {{ build_sql }}
        {%- endcall %}

        {% do adapter.commit() %}
    {% endif %}

    {{ run_hooks(post_hooks, inside_transaction=True) }}

    {% for rel in to_drop %}
        {% if rel.type is not none %}
            {% do adapter.drop_relation(rel) %}
        {% endif %}
    {% endfor %}

    {{ run_hooks(post_hooks, inside_transaction=False) }}

    {{ return({'relations': [target_relation]}) }}

{%- endmaterialization %}