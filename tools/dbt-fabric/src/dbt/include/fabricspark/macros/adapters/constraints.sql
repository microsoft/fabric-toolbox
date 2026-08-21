{% macro fabricspark__alter_column_set_constraints(relation, column_dict) %}
  {# Fabric Lakehouse does not support ALTER TABLE CHANGE COLUMN SET NOT NULL on Delta tables #}
  {% for column_name in column_dict %}
    {% set constraints = column_dict[column_name]['constraints'] %}
    {% for constraint in constraints %}
      {% if constraint.type == 'not_null' %}
        {{ exceptions.warn("Fabric Lakehouse does not support NOT NULL column constraints on Delta tables. "
          "Skipping NOT NULL for column `" ~ column_name ~ "`.") }}
      {% else %}
        {{ exceptions.warn('Invalid constraint for column ' ~ column_name ~ '. Only `not_null` is supported.') }}
      {% endif %}
    {% endfor %}
  {% endfor %}
{% endmacro %}
