{# dbt-spark only persists column comments (no relation-level comments).
   We add relation-level comments and use validate_doc_columns from dbt-adapters
   to filter columns before calling alter_column_comment. #}
{% macro fabricspark__persist_docs(relation, model, for_relation, for_columns) -%}
  {# dbt-spark has no relation-level comment support. We add it using COMMENT ON TABLE
     for tables and ALTER VIEW SET TBLPROPERTIES for views (Spark rejects COMMENT ON VIEW). #}
  {% if for_relation and config.persist_relation_docs() and model.description %}
    {% set escaped_comment = model.description | replace("'", "\\'") %}
    {% if relation.is_view %}
      {% set comment_query %}
        alter view {{ relation }} set tblproperties ('comment' = '{{ escaped_comment }}');
      {% endset %}
    {% else %}
      {% set comment_query %}
        comment on table {{ relation }} is '{{ escaped_comment }}';
      {% endset %}
    {% endif %}
    {% do run_query(comment_query) %}
  {% endif %}
  {# Spark does not support ALTER TABLE CHANGE COLUMN on views, so column comments are
     skipped for views. dbt-spark also skips views (it checks file_format in delta/hudi/iceberg). #}
  {% if for_columns and config.persist_column_docs() and model.columns and not relation.is_view %}
    {% set existing_columns = adapter.get_columns_in_relation(relation) | map(attribute="name") | list %}
    {% set filtered_columns = validate_doc_columns(relation, model.columns, existing_columns) %}
    {% do alter_column_comment(relation, filtered_columns) %}
  {% endif %}
{% endmacro %}

{# dbt-spark guards this with a file_format check (delta/hudi/iceberg). Fabric Lakehouse
   always uses Delta, so we skip that check. We also use validate_doc_columns in the caller
   instead of iterating over raw model.columns. #}
{% macro fabricspark__alter_column_comment(relation, column_dict) %}
  {% for column_name in column_dict %}
    {% set comment = column_dict[column_name]['description'] %}
    {% set escaped_comment = comment | replace('\'', '\\\'') %}
    {% set comment_query %}
      alter table {{ relation }} change column
          {{ adapter.quote(column_name) if column_dict[column_name]['quote'] else column_name }}
          comment '{{ escaped_comment }}';
    {% endset %}
    {% do run_query(comment_query) %}
  {% endfor %}
{% endmacro %}
