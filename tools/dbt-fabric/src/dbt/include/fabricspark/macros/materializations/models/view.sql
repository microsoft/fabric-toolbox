{% materialization view, adapter='fabricspark' %}
    {%- set grant_config = config.get('grants') -%}

    {# Upstream create_or_replace_view() uses adapter.get_relation(); we use load_cached_relation(this)
       for consistency with our other materializations (clone, materialized_view, incremental). #}
    {%- set old_relation = load_cached_relation(this) -%}
    {%- set exists_as_view = (old_relation is not none and old_relation.is_view) -%}

    {%- set target_relation = this.incorporate(type='view') -%}

    {# dbt-spark delegates to create_or_replace_view() which calls run_hooks(pre_hooks) without
       inside_transaction. We split into outside/inside to match dbt-adapters' default pattern. #}
    {{ run_hooks(pre_hooks, inside_transaction=False) }}

    {# Upstream create_or_replace_view() drops any non-view relation unconditionally via
       handle_existing_table(). We match that behavior for all non-view types (table,
       materialized_view) since CREATE OR REPLACE VIEW cannot replace a table. #}
    {%- if old_relation is not none and not old_relation.is_view -%}
        {% do adapter.drop_relation(old_relation) %}
    {%- endif -%}

    {{ run_hooks(pre_hooks, inside_transaction=True) }}

    {# Inline SQL instead of dispatching to get_create_view_as_sql() — Spark SQL uses
       CREATE OR REPLACE VIEW directly (no intermediate/rename/backup swap like dbt-adapters default). #}
    {% call statement('main') -%}
        create or replace view {{ target_relation }} as
            {{ sql }}
    {%- endcall %}

    {% set should_revoke = should_revoke(exists_as_view, full_refresh_mode=True) %}
    {% do apply_grants(target_relation, grant_config, should_revoke=should_revoke) %}

    {# Neither dbt-spark's view materialization nor upstream create_or_replace_view() calls
       persist_docs. We add it for relation-level comments (column comments are skipped for
       views in fabricspark__persist_docs since Spark rejects ALTER TABLE CHANGE COLUMN on views). #}
    {% do persist_docs(target_relation, model) %}

    {{ run_hooks(post_hooks, inside_transaction=True) }}
    {{ run_hooks(post_hooks, inside_transaction=False) }}

    {{ return({'relations': [target_relation]}) }}
{%- endmaterialization %}
