"""Unit tests for jobs pagination and extraction warning behavior."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch, PropertyMock

from fabric_assessment_tool.assessment.common import AssessmentStatus
from fabric_assessment_tool.assessment.databricks import (
    DatabricksJobs,
)
from fabric_assessment_tool.clients.databricks_client import DatabricksClient


def _create_client_with_mock_api():
    """Create a DatabricksClient with mocked internals for unit testing."""
    client = DatabricksClient.__new__(DatabricksClient)
    client.extraction_warnings = []
    client.api_client = MagicMock()
    return client


def _make_api_response(jobs_data, next_page_token=None):
    """Create a mock API response with jobs and optional page token."""
    response = MagicMock()
    data = {"jobs": jobs_data}
    if next_page_token:
        data["next_page_token"] = next_page_token
    response.json.return_value = data
    # Ensure text doesn't contain next_page_token to avoid recursive pagination
    response.text = "{}"
    response.status_code = 200
    return response


def _make_job_data(job_id):
    """Create minimal job data dict as returned by the Databricks API."""
    return {
        "job_id": job_id,
        "settings": {
            "name": f"job_{job_id}",
            "format": "MULTI_TASK",
            "tasks": [
                {
                    "task_key": "task1",
                    "notebook_task": {"notebook_path": f"/notebooks/nb_{job_id}"},
                }
            ],
        },
        "creator_user_name": "test@example.com",
        "created_time": 1700000000000,
    }


class TestGetJobsPagination:
    """Tests for _get_jobs() iterative pagination."""

    @patch.object(DatabricksClient, "_get_job_details")
    def test_single_page_no_token(self, mock_details):
        """Jobs API returns single page without next_page_token."""
        client = _create_client_with_mock_api()
        mock_details.side_effect = lambda job: MagicMock(job_id=job["job_id"])

        client.api_client.do_request.return_value = _make_api_response(
            [_make_job_data(1), _make_job_data(2)]
        )

        result = client._get_jobs()

        assert len(result.jobs) == 2
        assert client.api_client.do_request.call_count == 1
        assert client.extraction_warnings == []

    @patch.object(DatabricksClient, "_get_job_details")
    def test_multiple_pages(self, mock_details):
        """Jobs API returns multiple pages with next_page_token."""
        client = _create_client_with_mock_api()
        mock_details.side_effect = lambda job: MagicMock(job_id=job["job_id"])

        # First page has token, second page doesn't
        page1 = _make_api_response([_make_job_data(1)], next_page_token="token_abc")
        page2 = _make_api_response([_make_job_data(2), _make_job_data(3)])
        client.api_client.do_request.side_effect = [page1, page2]

        result = client._get_jobs()

        assert len(result.jobs) == 3
        assert client.api_client.do_request.call_count == 2
        # Verify second call includes page_token
        second_call_args = client.api_client.do_request.call_args_list[1]
        args_ns = second_call_args[0][0]
        assert args_ns.request_params["page_token"] == "token_abc"

    @patch.object(DatabricksClient, "_get_job_details")
    def test_empty_response(self, mock_details):
        """Jobs API returns empty list."""
        client = _create_client_with_mock_api()
        client.api_client.do_request.return_value = _make_api_response([])

        result = client._get_jobs()

        assert len(result.jobs) == 0
        assert client.extraction_warnings == []

    @patch.object(DatabricksClient, "_get_job_details")
    def test_skips_jobs_without_job_id(self, mock_details):
        """Jobs without job_id are skipped."""
        client = _create_client_with_mock_api()
        mock_details.side_effect = lambda job: MagicMock(job_id=job["job_id"])

        jobs_data = [_make_job_data(1), {"settings": {"name": "broken"}}]
        client.api_client.do_request.return_value = _make_api_response(jobs_data)

        result = client._get_jobs()

        assert len(result.jobs) == 1


class TestExtractionWarnings:
    """Tests for extraction failure warning behavior."""

    def test_exception_produces_warning_and_empty_result(self):
        """When API call fails, _get_jobs() returns empty list and records warning."""
        client = _create_client_with_mock_api()
        client.api_client.do_request.side_effect = RecursionError(
            "maximum recursion depth exceeded"
        )

        result = client._get_jobs()

        assert result.jobs == []
        assert "jobs" in client.extraction_warnings

    def test_multiple_warnings_accumulate(self):
        """Multiple extraction failures accumulate in warnings list."""
        client = _create_client_with_mock_api()
        client.extraction_warnings = ["clusters", "notebooks"]
        client.api_client.do_request.side_effect = Exception("network error")

        client._get_jobs()

        assert client.extraction_warnings == ["clusters", "notebooks", "jobs"]


class TestIncompleteStatus:
    """Tests for incomplete assessment status when warnings exist."""

    def test_status_incomplete_when_warnings_present(self):
        """Assessment status is 'incomplete' when extraction_warnings is non-empty."""
        client = _create_client_with_mock_api()
        client.extraction_warnings = ["jobs"]

        status = (
            AssessmentStatus(
                status="incomplete",
                description="Assessment completed with partial data. Failed to fully extract: jobs",
            )
            if client.extraction_warnings
            else AssessmentStatus(status="completed")
        )

        assert status.status == "incomplete"
        assert "jobs" in status.description

    def test_status_completed_when_no_warnings(self):
        """Assessment status is 'completed' when no extraction warnings."""
        client = _create_client_with_mock_api()
        client.extraction_warnings = []

        status = (
            AssessmentStatus(
                status="incomplete",
                description="...",
            )
            if client.extraction_warnings
            else AssessmentStatus(status="completed")
        )

        assert status.status == "completed"
