import pytest
from jinja2 import Environment

# This test renders a simplified copy of the fabric__get_use_database_sql macro
# directly via Jinja2, without a full dbt context. It validates the sanitization
# logic in isolation but does not exercise the actual macro file. Integration
# tests cover the real macro through adapter.dispatch().
MACRO_TEMPLATE = """\
{%- macro fabric__get_use_database_sql(database) -%}
  {%- if database is not none -%}
    USE [{{database | replace('"', '') | replace('[', '') | replace(']', '')}}];
  {%- endif -%}
{%- endmacro -%}
{{ fabric__get_use_database_sql(test_database) }}"""


@pytest.fixture
def jinja_env():
    return Environment()


def _render(jinja_env, database):
    template = jinja_env.from_string(MACRO_TEMPLATE)
    return template.render(test_database=database).strip()


def test_plain_database_name(jinja_env):
    assert _render(jinja_env, "my_database") == "USE [my_database];"


def test_double_quoted_database_name(jinja_env):
    assert _render(jinja_env, '"my_database"') == "USE [my_database];"


def test_bracket_quoted_database_name(jinja_env):
    assert _render(jinja_env, "[my_database]") == "USE [my_database];"


def test_bracket_and_double_quoted_database_name(jinja_env):
    assert _render(jinja_env, '"[my_database]"') == "USE [my_database];"


def test_none_database_returns_empty(jinja_env):
    assert _render(jinja_env, None) == ""


def test_database_with_spaces(jinja_env):
    assert _render(jinja_env, "my database") == "USE [my database];"


def test_database_with_brackets_and_spaces(jinja_env):
    assert _render(jinja_env, "[my database]") == "USE [my database];"


def test_database_with_closing_bracket_in_name(jinja_env):
    assert _render(jinja_env, "my]database") == "USE [mydatabase];"


def test_database_with_brackets_containing_closing_bracket(jinja_env):
    assert _render(jinja_env, "[my]database]") == "USE [mydatabase];"
