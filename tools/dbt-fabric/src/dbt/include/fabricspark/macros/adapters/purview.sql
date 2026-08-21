{% macro purview_sync(sync_descriptions=true, sync_lineage=true, sync_metadata=true) %}
    {% if execute %}
        {{ return(adapter.purview_sync(
            graph=graph,
            results=results if results is defined else none,
            sync_descriptions=sync_descriptions,
            sync_lineage=sync_lineage,
            sync_metadata=sync_metadata
        )) }}
    {% endif %}
    {{ return("") }}
{% endmacro %}
