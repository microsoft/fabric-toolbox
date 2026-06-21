{#- Upstream uses STDDEV(). T-SQL spells it STDEV(). #}
{% macro fabric__test_expect_column_stdev_to_be_between(model, column_name,
                                                    min_value,
                                                    max_value,
                                                    group_by,
                                                    row_condition=None,
                                                    strictly=False
                                                    ) -%}
{% set expression %}
stdev({{ column_name }})
{% endset %}
{{ dbt_expectations.expression_between(model,
                                        expression=expression,
                                        min_value=min_value,
                                        max_value=max_value,
                                        group_by_columns=group_by,
                                        row_condition=row_condition,
                                        strictly=strictly
                                        ) }}
{% endmacro %}
