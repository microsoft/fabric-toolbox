{% macro run_hooks(hooks, inside_transaction=True) %}
  {% for hook in hooks | selectattr('transaction', 'equalto', inside_transaction)  %}
    {# For now we don't support transactions #}
    {# {% if not inside_transaction and loop.first %}
      {% call statement(auto_begin=inside_transaction) %}
        commit;
      {% endcall %}
    {% endif %} #}
    {% set rendered = render(hook.get('sql')) | trim %}
    {% if (rendered | length) > 0 %}
      {% call statement(auto_begin=inside_transaction) %}
        {{ rendered }}
      {% endcall %}
    {% endif %}
  {% endfor %}
{% endmacro %}