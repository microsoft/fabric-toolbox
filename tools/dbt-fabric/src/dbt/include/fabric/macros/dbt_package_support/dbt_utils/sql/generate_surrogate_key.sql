{%- macro fabric__generate_surrogate_key(field_list) -%}

{%- if var('surrogate_key_treat_nulls_as_empty_strings', False) -%}
    {%- set default_null_value = "" -%}
{%- else -%}
    {%- set default_null_value = '_dbt_utils_surrogate_key_null_' -%}
{%- endif -%}

{%- set fields = [] -%}

{%- for field in field_list -%}

    {%- do fields.append(
        "coalesce(cast(" ~ field ~ " as " ~ dbt.type_string() ~ "), '" ~ default_null_value  ~"')"
    ) -%}

    {%- if not loop.last %}
        {%- do fields.append("'-'") -%}
    {%- endif -%}

{%- endfor -%}

{#- Upstream uses md5() directly. T-SQL has no md5(); dbt.hash() resolves to HASHBYTES. -#}
{%- if fields|length > 1 %}
    {{ dbt.hash(dbt.concat(fields)) }}
{%- else -%}
    {{ dbt.hash(fields[0]) }}
{%- endif -%}

{%- endmacro -%}
