from datetime import datetime

from fabric_assessment_tool.assessment.synapse import (
    SynapseQueryActivity,
    SynapseSessionActivity,
)
from fabric_assessment_tool.utils.workload_profile import build_workload_profile


def query(
    request_id: str,
    start_time: str,
    end_time: str | None,
    duration_ms: float | None,
    status: str = "Completed",
    resource_class: str = "smallrc",
) -> SynapseQueryActivity:
    return SynapseQueryActivity(
        request_id=request_id,
        session_id=f"session-{request_id}",
        status=status,
        resource_class=resource_class,
        importance="normal",
        submit_time=start_time,
        start_time=start_time,
        end_time=end_time,
        duration_ms=duration_ms,
        queue_duration_ms=0,
        label=None,
        login_name="tester",
        command=None,
        json_response={},
    )


def test_build_workload_profile_calculates_distributions_and_percentiles():
    requests = [
        query("1", "2026-01-05T09:00:00", "2026-01-05T09:00:01", 1000),
        query(
            "2",
            "2026-01-05T09:00:00.500000",
            "2026-01-05T09:00:02",
            2000,
            resource_class="largerc",
        ),
        query(
            "3",
            "2026-01-06T10:00:00",
            "2026-01-06T10:00:04",
            4000,
            status="Failed",
        ),
    ]
    sessions = [
        SynapseSessionActivity(
            "session-1", "Active", "tester", "2026-01-05T09:00:00", 2, None, None, {}
        )
    ]

    profile = build_workload_profile(
        requests, sessions, 7, 1000, True, datetime(2026, 1, 7)
    )

    assert profile.request_count == 3
    assert profile.session_count == 1
    assert profile.peak_concurrency == 2
    assert profile.status_distribution == {"Completed": 2, "Failed": 1}
    assert profile.resource_class_distribution == {"largerc": 1, "smallrc": 2}
    assert profile.duration_statistics.average_ms == 2333.33
    assert profile.duration_statistics.p50_ms == 2000
    assert profile.duration_statistics.p90_ms == 3600
    assert profile.duration_statistics.p99_ms == 3960
    assert profile.duration_statistics.max_ms == 4000
    assert [
        (b.day_of_week, b.hour, b.request_count) for b in profile.temporal_buckets
    ] == [
        (0, 9, 2),
        (1, 10, 1),
    ]


def test_peak_concurrency_does_not_overlap_adjacent_requests():
    profile = build_workload_profile(
        [
            query("1", "2026-01-05T09:00:00", "2026-01-05T09:01:00", 60000),
            query("2", "2026-01-05T09:01:00", "2026-01-05T09:02:00", 60000),
        ],
        [],
        7,
        1000,
        True,
        datetime(2026, 1, 7),
    )
    assert profile.peak_concurrency == 1


def test_queued_request_does_not_count_as_execution_concurrency():
    queued = query("1", "2026-01-05T09:00:00", None, None, status="Queued")
    queued.start_time = None

    profile = build_workload_profile(
        [queued], [], 7, 1000, True, datetime(2026, 1, 5, 10)
    )

    assert profile.peak_concurrency == 0


def test_empty_profile_has_empty_duration_statistics():
    profile = build_workload_profile([], [], 7, 1000, True, datetime(2026, 1, 7))
    assert profile.request_count == 0
    assert profile.peak_concurrency == 0
    assert profile.duration_statistics.p99_ms is None
    assert profile.temporal_buckets == []
