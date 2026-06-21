{% macro fabric__array_concat(array_1, array_2) -%}
    CASE
        WHEN COALESCE(JSON_VALUE({{ array_1 }}, '$[0]'), JSON_QUERY({{ array_1 }}, '$[0]')) IS NULL THEN
            CASE
                WHEN COALESCE(JSON_VALUE({{ array_2 }}, '$[0]'), JSON_QUERY({{ array_2 }}, '$[0]')) IS NULL THEN '[]'
                ELSE {{ array_2 }}
            END
        WHEN COALESCE(JSON_VALUE({{ array_2 }}, '$[0]'), JSON_QUERY({{ array_2 }}, '$[0]')) IS NULL THEN {{ array_1 }}
        ELSE CONCAT(
            LEFT({{ array_1 }}, LEN({{ array_1 }}) - 1),
            ',',
            STUFF({{ array_2 }}, 1, 1, '')
        )
    END
{%- endmacro %}