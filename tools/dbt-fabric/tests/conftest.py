import functools
import importlib.util
import os
from pathlib import Path

import pytest
import yaml

from dbt.adapters.fabric.fabric_api_client import FabricApiClient
from dbt.adapters.fabric.fabric_credentials import FabricCredentials
from dbt.adapters.fabric.fabric_token_provider import FabricTokenProvider
from dbt.adapters.fabric.purview_client import PurviewClient
from dbt.tests.util import write_file
from tests import _python_model_livy_capture

pytest_plugins = ["dbt.tests.fixtures.project"]

requires_purview = pytest.mark.requires_purview


@pytest.fixture(scope="session", autouse=True)
def _capture_python_model_livy_sessions():
    """Patch FabricLivyHelper at session start so every python-model HC Livy
    session it constructs is recorded in the test-only registry, then restore
    the original __init__ at session end. The per-class `project` fixture
    teardown calls `close_all()` to release those sessions before
    drop_test_schema runs.
    """
    restore = _python_model_livy_capture.install_capture()
    try:
        yield
    finally:
        restore()


def _auth_kwargs_from_env() -> dict:
    kwargs = {}
    auth = os.getenv("FABRIC_TEST_AUTH")
    if auth:
        kwargs["authentication"] = auth
    for key in ("tenant_id", "client_id", "federated_token_url", "federated_token_file"):
        val = os.getenv(f"FABRIC_TEST_{key.upper()}")
        if val:
            kwargs[key] = val
    federated_header = os.getenv("FABRIC_TEST_FEDERATED_TOKEN_HEADER")
    if federated_header:
        kwargs["federated_token_header"] = federated_header
    return kwargs


@pytest.fixture(scope="class")
def adapter_type(request) -> str:
    tests_root = Path(__file__).parent
    test_child_path = Path(request.fspath).relative_to(tests_root).parts[0]
    return test_child_path


@pytest.fixture(scope="class")
def dbt_profile_target(dbt_profile_target_update, adapter_type: str, prefix: str):
    target = {
        "livy_session_name": os.getenv("FABRIC_TEST_LIVY_SESSION_NAME", prefix),
        "workspace_name": os.getenv("FABRIC_TEST_WORKSPACE_NAME"),
        "workspace_id": os.getenv("FABRIC_TEST_WORKSPACE_ID"),
        "retries": 3,
        "threads": int(os.getenv("FABRIC_TEST_THREADS", 10)),
        **_auth_kwargs_from_env(),
    }

    if base_api_uri := os.getenv("FABRIC_TEST_BASE_API_URI"):
        target["fabric_base_api_uri"] = base_api_uri
    if powerbi_api_uri := os.getenv("FABRIC_TEST_POWERBI_BASE_API_URI"):
        target["powerbi_base_api_uri"] = powerbi_api_uri

    if adapter_type == "fabric":
        adapter_settings = {
            "type": "fabric",
            "host": os.getenv("FABRIC_TEST_HOST"),
            "lakehouse": os.getenv("FABRIC_TEST_LAKEHOUSE_NAME"),
            "database": os.getenv("FABRIC_TEST_DWH_NAME"),
            "purview_endpoint": os.getenv("FABRIC_TEST_PURVIEW_ENDPOINT"),
            "login_timeout": 60,
            "query_timeout": 300,  # 5 minutes
        }
    elif adapter_type == "fabricspark":
        adapter_settings = {
            "type": "fabricspark",
            "database": os.getenv("FABRIC_TEST_LAKEHOUSE_NAME"),
        }
    else:
        raise ValueError(f"Unsupported adapter_type: {adapter_type}")

    target.update(adapter_settings)
    target.update(dbt_profile_target_update)
    return target


@pytest.fixture(scope="class")
def dbt_profile_target_update():
    return {}


@pytest.fixture(scope="class")
def profile_user(dbt_profile_target):
    return "dbo"


def pytest_addoption(parser):
    parser.addoption("--with-grants", action="store_true", default=False, help="run GRANT tests")
    parser.addoption(
        "--de", action="store_true", default=False, help="run only Fabric Spark tests"
    )
    parser.addoption(
        "--dw", action="store_true", default=False, help="run only Fabric T-SQL tests"
    )


def pytest_configure(config):
    config.addinivalue_line("markers", "grants: mark test containing GRANT statements")
    config.addinivalue_line(
        "markers", "requires_purview: skip unless FABRIC_TEST_PURVIEW_ENDPOINT is set"
    )
    config.addinivalue_line(
        "markers",
        "cross_workspace: skip unless FABRIC_TEST_CROSS_WORKSPACE_NAME is set",
    )


def _requires_spark(collection_path, tests_root):
    rel = collection_path.relative_to(tests_root)
    parts = rel.parts
    if not parts:
        return False
    if parts[0] == "fabricspark":
        return True
    return "fabricspark" in collection_path.name


@functools.lru_cache(maxsize=1)
def _spark_extra_available():
    return importlib.util.find_spec("dbt.adapters.spark") is not None


def pytest_ignore_collect(collection_path, config):
    tests_root = Path(__file__).parent
    try:
        rel = collection_path.relative_to(tests_root)
    except ValueError:
        return None

    parts = rel.parts
    if not parts:
        return None

    top_dir = parts[0]

    if config.getoption("--dw", default=False) and _requires_spark(collection_path, tests_root):
        return True
    if config.getoption("--de", default=False) and top_dir == "fabric":
        return True

    if _requires_spark(collection_path, tests_root) and not _spark_extra_available():  # noqa: SIM102
        if config.getoption("--de", default=False):
            pytest.exit(
                "The spark extra is required for FabricSpark tests. "
                "Install with: uv sync --extra spark",
                returncode=4,
            )
        return True

    return None


def pytest_collection_modifyitems(config, items):
    if config.getoption("--de") and config.getoption("--dw"):
        raise ValueError("Cannot specify both --de and --dw options")
    elif config.getoption("--de"):
        adapter_type = "fabricspark"
    elif config.getoption("--dw"):
        adapter_type = "fabric"
    else:
        adapter_type = None

    skip_grants = pytest.mark.skip(reason="need --with-grants option to run")
    skip_purview = pytest.mark.skip(reason="FABRIC_TEST_PURVIEW_ENDPOINT not set")
    skip_cross_workspace = pytest.mark.skip(
        reason="FABRIC_TEST_CROSS_WORKSPACE_NAME and FABRIC_TEST_CROSS_LAKEHOUSE_NAME not set"
    )
    has_purview = bool(os.getenv("FABRIC_TEST_PURVIEW_ENDPOINT"))
    has_cross_workspace = bool(os.getenv("FABRIC_TEST_CROSS_WORKSPACE_NAME")) and bool(
        os.getenv("FABRIC_TEST_CROSS_LAKEHOUSE_NAME")
    )
    tests_root = Path(__file__).parent

    for item in items:
        tests_child_path = Path(item.fspath).relative_to(tests_root).parts[0]

        if "grants" in item.keywords and not config.getoption("--with-grants"):
            item.add_marker(skip_grants)

        if "requires_purview" in item.keywords and not has_purview:
            item.add_marker(skip_purview)

        if "cross_workspace" in item.keywords and not has_cross_workspace:
            item.add_marker(skip_cross_workspace)

        if adapter_type is not None and tests_child_path != adapter_type:
            item.add_marker(
                pytest.mark.skip(
                    reason=f"Test is for {tests_child_path} adapter, not {adapter_type}"
                )
            )


@pytest.fixture(scope="class")
def logs_dir(request, prefix):
    dbt_log_dir = os.path.join(request.config.rootdir, "logs", prefix)
    print(f"\n=== Test logs_dir: {dbt_log_dir}\n")
    os.environ["DBT_LOG_PATH"] = str(dbt_log_dir)
    yield str(Path(dbt_log_dir))
    del os.environ["DBT_LOG_PATH"]


@pytest.fixture(scope="class")
def dbt_core_bug_workaround(project):
    # Workaround for https://github.com/dbt-labs/dbt-core/issues/5410
    with open(Path(project.project_root).parent / "dbt_project.yml", "w") as f:
        f.write(yaml.safe_dump({"name": "workaround"}))


@pytest.fixture(scope="class")
def project(
    project_setup,
    project_files,
):
    from dbt.tests.fixtures.project import TestProjInfo

    class TestProjInfoFabric(TestProjInfo):
        def get_tables_in_schema(self):
            sql = f"""
                    select
                            t.name as table_name,
                            'table' as materialization
                    from sys.tables t
                    inner join sys.schemas s
                    on s.schema_id = t.schema_id
                    where lower(s.name) = '{self.test_schema.lower()}'
                    union all
                    select
                            v.name as table_name,
                            'view' as materialization
                    from sys.views v
                    inner join sys.schemas s
                    on s.schema_id = v.schema_id
                    where lower(s.name) = '{self.test_schema.lower()}'
                    """
            result = self.run_sql(sql, fetch="all")
            return dict(result)

    yield TestProjInfoFabric(
        project_root=project_setup.project_root,
        profiles_dir=project_setup.profiles_dir,
        adapter_type=project_setup.adapter_type,
        test_dir=project_setup.test_dir,
        shared_data_dir=project_setup.shared_data_dir,
        test_data_dir=project_setup.test_data_dir,
        test_schema=project_setup.test_schema,
        database=project_setup.database,
        test_config=project_setup.test_config,
    )

    # Close any python-model HC Livy sessions opened during this test
    # class before the outer project_setup fixture tries to drop the test
    # schema. The synapsesql connector keeps JDBC sessions to the DW alive
    # on its warm-up pool, which hold Sch-S on the schema metadata and
    # block DROP SCHEMA on Sch-M for the full Spark idle-reap window
    # (25+ min, observed in run 26030423528). Closing the HC session
    # tears down the Spark application and releases every JDBC session
    # it owns. FabricSpark adapter HC sessions are not affected — those
    # are dbt-managed via FabricSparkConnection.close() and cleaned up
    # by cleanup_all.
    _python_model_livy_capture.close_all()


@pytest.fixture(scope="class")
def credentials(adapter) -> FabricCredentials:
    return adapter.config.credentials


@pytest.fixture(scope="class")
def fabric_token_provider(credentials: FabricCredentials) -> FabricTokenProvider:
    return FabricTokenProvider(credentials)


@pytest.fixture(scope="class")
def fabric_api_client(
    fabric_token_provider: FabricTokenProvider, credentials: FabricCredentials
) -> FabricApiClient:
    return FabricApiClient.create(credentials, fabric_token_provider)


@pytest.fixture(scope="class")
def purview_client(
    fabric_token_provider: FabricTokenProvider, credentials: FabricCredentials
) -> PurviewClient:
    assert credentials.purview_endpoint, "purview_endpoint must be set in profile"
    return PurviewClient(credentials.purview_endpoint, fabric_token_provider)


@pytest.fixture(scope="class")
def cross_workspace_config():
    return {
        "workspace_name": os.getenv("FABRIC_TEST_CROSS_WORKSPACE_NAME"),
        "lakehouse_name": os.getenv("FABRIC_TEST_CROSS_LAKEHOUSE_NAME"),
    }


def _deep_merge(base: dict, override: dict) -> dict:
    """Deep merge override into base. Returns the merged dict (mutates base)."""
    for key, value in override.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


@pytest.fixture(scope="class")
def dbt_project_yml(project_root, project_config_update, adapter_type: str):
    project_config = {
        "name": "test",
        "profile": "test",
        "flags": {"send_anonymous_usage_stats": False},
    }

    if project_config_update:
        if isinstance(project_config_update, str):
            project_config_update = yaml.safe_load(project_config_update)
        if isinstance(project_config_update, dict):
            _deep_merge(project_config, project_config_update)
        else:
            raise TypeError(
                f"project_config_update must be a dict or YAML string, "
                f"got {type(project_config_update).__name__}: {project_config_update!r}"
            )
    write_file(yaml.safe_dump(project_config), project_root, "dbt_project.yml")
    return project_config
