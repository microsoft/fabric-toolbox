{% materialization materialized_view, adapter='fabricspark' %}
    {% set existing_relation = load_cached_relation(this) %}
    {% set target_relation = this.incorporate(type=this.MaterializedView) %}
    {% set intermediate_relation = make_intermediate_relation(target_relation) %}
    {% if existing_relation is not none %}
        {% set backup_relation = make_backup_relation(target_relation, existing_relation.type) %}
    {% else %}
        {% set backup_relation = none %}
    {% endif %}

    {{ run_hooks(pre_hooks, inside_transaction=False) }}

    {% set full_refresh_mode = should_full_refresh() %}

    {# determine the scenario we're in: create, replace, or refresh #}
    {% if existing_relation is not none and existing_relation.is_materialized_view %}
        {% set has_configuration_changes = get_materialized_view_configuration_changes(existing_relation, config) %}
    {% else %}
        {% set has_configuration_changes = false %}
    {% endif %}

    {% if existing_relation is none or (existing_relation.is_materialized_view and (has_configuration_changes or full_refresh_mode)) %}
        {% set build_sql = get_create_materialized_view_as_sql(target_relation, sql) %}
        {% set needs_swap = false %}
    {% elif not existing_relation.is_materialized_view %}
        {% set build_sql = get_create_materialized_view_as_sql(intermediate_relation, sql) %}
        {% set needs_swap = true %}
    {% else %}
        {% set build_sql = refresh_materialized_view(target_relation) %}
        {% set needs_swap = false %}
    {% endif %}
    
    {{ run_hooks(pre_hooks, inside_transaction=True) }}

    {% set grant_config = config.get('grants') %}

    {% call statement(name="main") %}
        {{ build_sql }}
    {% endcall %}

    {# Atomic swap: rename existing → backup, intermediate → target #}
    {% if needs_swap %}
        {% if backup_relation is not none %}
            {{ adapter.rename_relation(existing_relation, backup_relation) }}
        {% endif %}
        {{ adapter.rename_relation(intermediate_relation, target_relation) }}
    {% endif %}

    {% do persist_docs(target_relation, model) %}

    {% set should_revoke = should_revoke(existing_relation, full_refresh_mode=True) %}
    {% do apply_grants(target_relation, grant_config, should_revoke=should_revoke) %}

    {{ run_hooks(post_hooks, inside_transaction=True) }}

    {{ drop_relation_if_exists(backup_relation) }}
    {{ drop_relation_if_exists(intermediate_relation) }}

    {{ run_hooks(post_hooks, inside_transaction=False) }}

    {{ return({'relations': [target_relation]}) }}
{% endmaterialization %}