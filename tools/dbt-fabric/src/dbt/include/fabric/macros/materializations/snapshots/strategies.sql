{% macro fabric__snapshot_hash_arguments(args) %}
    CONVERT(VARCHAR(32), HashBytes('MD5', {% for arg in args %}
        coalesce(cast({{ arg }} as varchar(max)), '') {% if not loop.last %} + '|' + {% endif %}
    {% endfor %}), 2)
{% endmacro %}
