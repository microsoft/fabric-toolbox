{#- Override: queries sys.tables joined with sys.schemas instead of information_schema.tables.
    T-SQL sys views provide reliable pattern matching via LIKE on Fabric Data Warehouse. -#}
{% macro fabric__get_tables_by_pattern_sql(schema_pattern, table_pattern, exclude='', database=target.database) %}

        select
                s.name as table_schema,
                t.name as table_name,
                'table' as table_type
        from sys.tables t
        inner join sys.schemas s
        on s.schema_id = t.schema_id
        where s.name like '{{ schema_pattern }}'
        and t.name like '{{ table_pattern }}'
        and t.name not like '{{ exclude }}'

{% endmacro %}
