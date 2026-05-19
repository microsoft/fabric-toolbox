{#- T-SQL STRING_SPLIT only accepts single-char separators. We REPLACE the actual
    delimiter with char(1) (SOH) first, then split on that. #}
{% macro fabric__split_part(string_text, delimiter_text, part_number) %}
    (
        select value
        from
            (select
                value,
                row_number() over (order by ordinal asc) as forward_index,
                row_number() over (order by ordinal desc) as backward_index
            from string_split(
                replace({{ string_text }}, {{ delimiter_text }}, char(1)),
                char(1), 1
            )) as SplitData
        where {% if part_number > 0 %}forward{% else %}backward{% endif %}_index = {{ part_number|abs }}
    )
{% endmacro %}
