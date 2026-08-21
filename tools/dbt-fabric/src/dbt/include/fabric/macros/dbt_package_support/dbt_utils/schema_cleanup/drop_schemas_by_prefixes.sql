{#- Override: queries sys.schemas with LIKE instead of information_schema.schemata.
    T-SQL uses sys.schemas for schema enumeration; Fabric does not support all ANSI catalog views. -#}
{% macro fabric__drop_schemas_by_prefixes(prefixes) %}
    {# Ensure input is a list to iterate later #}
    {% set prefix_list = [prefixes] if prefixes is string else prefixes %}

    {% for prefix in prefix_list %}
        {# Fetch all schemas that use the current prefix #}
        {% do log('Fetching schemas for ' + prefix + '...', info=True) %}
        {% set schemas_table %}
            select name
            from sys.schemas
            where name LIKE '{{prefix}}%'
        {% endset %}
        {% set schema_names = run_query(schemas_table).columns[0].values() %}

        {# Test if results are empty #}
        {% if schema_names is none or schema_names|length == 0 %}
            {% do log('None found.', info=True) %}
        {% else %}
            {# Drop each found schema #}
            {% for schema_name in schema_names %}
                {% do log('Dropping schema ' + schema_name, info=True) %}
                {% do fabric__drop_schema_by_name(schema_name) %}
            {% endfor %}
        {% endif %}
    {% endfor %}

{% endmacro %}