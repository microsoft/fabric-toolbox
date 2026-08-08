"""Unit tests for notebook-job cross-reference logic."""

from fabric_assessment_tool.assessment.databricks import (
    DatabricksJob,
    DatabricksJobRun,
    DatabricksJobRuns,
    DatabricksJobs,
    DatabricksJobSettings,
    DatabricksJobTask,
    DatabricksJobTasks,
    DatabricksNotebook,
    DatabricksNotebooks,
)
from fabric_assessment_tool.clients.databricks_client import DatabricksClient


def _make_notebook(path: str) -> DatabricksNotebook:
    return DatabricksNotebook(
        path=path,
        default_language="python",
        embedded_languages=[],
        other_magics=[],
        json_response={},
    )


def _make_job(
    job_id: int,
    notebook_paths: list[str],
    run_start_times: list[str] | None = None,
) -> DatabricksJob:
    tasks = [
        DatabricksJobTask(
            name=f"task_{i}",
            type="notebook",
            libraries={},
            json_response={"notebook_task": {"notebook_path": p}},
            notebook_path=p,
        )
        for i, p in enumerate(notebook_paths)
    ]
    runs = []
    if run_start_times:
        runs = [
            DatabricksJobRun(
                id=str(i),
                state="TERMINATED",
                result_state="SUCCESS",
                start_time=t,
                end_time=None,
                execution_duration="1000",
                json_response={},
            )
            for i, t in enumerate(run_start_times)
        ]
    return DatabricksJob(
        job_id=job_id,
        tasks=DatabricksJobTasks(tasks=tasks),
        settings=DatabricksJobSettings(name=f"job_{job_id}", json_response={}),
        latest_runs=DatabricksJobRuns(runs=runs),
    )


def _make_non_notebook_job(job_id: int) -> DatabricksJob:
    task = DatabricksJobTask(
        name="spark_task",
        type="spark_jar",
        libraries={},
        json_response={"spark_jar_task": {"main_class_name": "com.example.Main"}},
        notebook_path=None,
    )
    return DatabricksJob(
        job_id=job_id,
        tasks=DatabricksJobTasks(tasks=[task]),
        settings=DatabricksJobSettings(name=f"job_{job_id}", json_response={}),
        latest_runs=DatabricksJobRuns(runs=[]),
    )


class TestNotebookPathExtraction:
    """Tests for notebook_path field on DatabricksJobTask."""

    def test_notebook_task_has_path(self):
        task = DatabricksJobTask(
            name="run_nb",
            type="notebook",
            libraries={},
            json_response={"notebook_task": {"notebook_path": "/Users/me/nb"}},
            notebook_path="/Users/me/nb",
        )
        assert task.notebook_path == "/Users/me/nb"

    def test_non_notebook_task_has_none_path(self):
        task = DatabricksJobTask(
            name="jar_task",
            type="spark_jar",
            libraries={},
            json_response={"spark_jar_task": {"main_class_name": "Main"}},
        )
        assert task.notebook_path is None


class TestAnnotateNotebooksWithJobExecution:
    """Tests for _annotate_notebooks_with_job_execution."""

    def test_notebook_referenced_by_job_gets_annotated(self):
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(
            notebooks=[_make_notebook("/Users/me/notebook1")]
        )
        jobs = DatabricksJobs(
            jobs=[
                _make_job(
                    101,
                    ["/Users/me/notebook1"],
                    ["2026-06-15T10:00:00+00:00"],
                )
            ]
        )

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert nb.executed_by_jobs == [101]
        assert nb.last_job_execution == "2026-06-15T10:00:00+00:00"

    def test_notebook_not_referenced_stays_unannotated(self):
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(
            notebooks=[_make_notebook("/Users/me/other_notebook")]
        )
        jobs = DatabricksJobs(
            jobs=[
                _make_job(101, ["/Users/me/notebook1"], ["2026-06-15T10:00:00+00:00"])
            ]
        )

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert nb.executed_by_jobs is None
        assert nb.last_job_execution is None

    def test_multiple_jobs_reference_same_notebook(self):
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(notebooks=[_make_notebook("/shared/etl")])
        jobs = DatabricksJobs(
            jobs=[
                _make_job(1, ["/shared/etl"], ["2026-06-10T08:00:00+00:00"]),
                _make_job(2, ["/shared/etl"], ["2026-06-20T12:00:00+00:00"]),
            ]
        )

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert sorted(nb.executed_by_jobs) == [1, 2]
        assert nb.last_job_execution == "2026-06-20T12:00:00+00:00"

    def test_job_with_no_runs_still_annotates_job_id(self):
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(notebooks=[_make_notebook("/Users/me/nb")])
        jobs = DatabricksJobs(jobs=[_make_job(99, ["/Users/me/nb"], None)])

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert nb.executed_by_jobs == [99]
        assert nb.last_job_execution is None

    def test_non_notebook_jobs_do_not_affect_notebooks(self):
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(notebooks=[_make_notebook("/Users/me/nb")])
        jobs = DatabricksJobs(jobs=[_make_non_notebook_job(50)])

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert nb.executed_by_jobs is None
        assert nb.last_job_execution is None

    def test_empty_jobs_list(self):
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(notebooks=[_make_notebook("/Users/me/nb")])
        jobs = DatabricksJobs(jobs=[])

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert nb.executed_by_jobs is None
        assert nb.last_job_execution is None


class TestPathNormalization:
    """Tests for /Workspace prefix normalization in cross-reference."""

    def test_job_with_workspace_prefix_matches_notebook_without(self):
        """Job paths with /Workspace/ prefix match notebooks without it."""
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(
            notebooks=[_make_notebook("/CM_PROD/core/notebook1")]
        )
        jobs = DatabricksJobs(
            jobs=[
                _make_job(
                    101,
                    ["/Workspace/CM_PROD/core/notebook1"],
                    ["2026-06-15T10:00:00+00:00"],
                )
            ]
        )

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert nb.executed_by_jobs == [101]
        assert nb.last_job_execution == "2026-06-15T10:00:00+00:00"

    def test_both_paths_without_workspace_prefix_still_match(self):
        """Paths without /Workspace prefix match normally."""
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(
            notebooks=[_make_notebook("/Users/me/notebook")]
        )
        jobs = DatabricksJobs(
            jobs=[
                _make_job(
                    200,
                    ["/Users/me/notebook"],
                    ["2026-07-01T08:00:00+00:00"],
                )
            ]
        )

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)

        nb = result.notebooks[0]
        assert nb.executed_by_jobs == [200]

    def test_workspace_prefix_on_users_path(self):
        """/Workspace/Users/... in job matches /Users/... in notebook."""
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(notebooks=[_make_notebook("/Users/admin/etl")])
        jobs = DatabricksJobs(
            jobs=[
                _make_job(
                    300,
                    ["/Workspace/Users/admin/etl"],
                    ["2026-06-20T12:00:00+00:00"],
                )
            ]
        )

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)
        assert result.notebooks[0].executed_by_jobs == [300]


class TestForEachTaskExtraction:
    """Tests for notebook_path extraction from for_each_task."""

    def test_for_each_task_notebook_path(self):
        """DatabricksJobTask with for_each_task should have notebook_path set."""
        task = DatabricksJobTask(
            name="foreach_task",
            type="for_each",
            libraries={},
            json_response={
                "for_each_task": {
                    "task": {
                        "notebook_task": {"notebook_path": "/Workspace/etl/foreach_nb"}
                    }
                }
            },
            notebook_path="/Workspace/etl/foreach_nb",
        )
        assert task.notebook_path == "/Workspace/etl/foreach_nb"

    def test_for_each_task_cross_references_with_normalization(self):
        """for_each_task notebook path with /Workspace prefix matches notebook."""
        client = DatabricksClient()
        notebooks = DatabricksNotebooks(notebooks=[_make_notebook("/etl/foreach_nb")])
        jobs = DatabricksJobs(
            jobs=[
                _make_job(
                    400,
                    ["/Workspace/etl/foreach_nb"],
                    ["2026-07-01T10:00:00+00:00"],
                )
            ]
        )

        result = client._annotate_notebooks_with_job_execution(notebooks, jobs)
        assert result.notebooks[0].executed_by_jobs == [400]
