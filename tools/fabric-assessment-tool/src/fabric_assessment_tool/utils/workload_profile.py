"""Pure helpers for deriving dedicated SQL pool workload profiles."""

from collections import Counter
from datetime import datetime, timezone
from math import floor
from typing import Iterable, Optional

from ..assessment.synapse import (
    SynapseDurationStatistics,
    SynapseQueryActivity,
    SynapseSessionActivity,
    SynapseTemporalBucket,
    SynapseWorkloadProfile,
)


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def _percentile(values: list[float], percentile: float) -> Optional[float]:
    """Return a linearly interpolated percentile for sorted numeric values."""
    if not values:
        return None
    if len(values) == 1:
        return values[0]

    position = (len(values) - 1) * percentile
    lower = floor(position)
    upper = min(lower + 1, len(values) - 1)
    fraction = position - lower
    return values[lower] + (values[upper] - values[lower]) * fraction


def calculate_duration_statistics(
    requests: Iterable[SynapseQueryActivity],
) -> SynapseDurationStatistics:
    durations = sorted(
        float(request.duration_ms)
        for request in requests
        if request.duration_ms is not None and request.duration_ms >= 0
    )
    if not durations:
        return SynapseDurationStatistics(None, None, None, None, None)

    return SynapseDurationStatistics(
        average_ms=round(sum(durations) / len(durations), 2),
        p50_ms=round(_percentile(durations, 0.50) or 0, 2),
        p90_ms=round(_percentile(durations, 0.90) or 0, 2),
        p99_ms=round(_percentile(durations, 0.99) or 0, 2),
        max_ms=round(max(durations), 2),
    )


def calculate_peak_concurrency(
    requests: Iterable[SynapseQueryActivity], collected_at: datetime
) -> int:
    if collected_at.tzinfo is not None:
        collected_at = collected_at.astimezone(timezone.utc).replace(tzinfo=None)

    events: list[tuple[datetime, int]] = []
    for request in requests:
        start = _parse_timestamp(request.start_time)
        if start is None:
            continue
        end = _parse_timestamp(request.end_time) or collected_at
        if end < start:
            continue
        events.append((start, 1))
        events.append((end, -1))

    current = 0
    peak = 0
    for _, delta in sorted(events, key=lambda event: (event[0], event[1])):
        current += delta
        peak = max(peak, current)
    return peak


def calculate_temporal_buckets(
    requests: Iterable[SynapseQueryActivity],
) -> list[SynapseTemporalBucket]:
    counts: Counter[tuple[int, int]] = Counter()
    for request in requests:
        timestamp = _parse_timestamp(request.start_time or request.submit_time)
        if timestamp is not None:
            counts[(timestamp.weekday(), timestamp.hour)] += 1

    return [
        SynapseTemporalBucket(day_of_week=day, hour=hour, request_count=count)
        for (day, hour), count in sorted(counts.items())
    ]


def build_workload_profile(
    requests: list[SynapseQueryActivity],
    sessions: list[SynapseSessionActivity],
    window_days: int,
    top_n: int,
    sql_text_redacted: bool,
    collected_at: datetime,
) -> SynapseWorkloadProfile:
    request_timestamps = [
        timestamp
        for request in requests
        for timestamp in (
            _parse_timestamp(request.submit_time),
            _parse_timestamp(request.start_time),
            _parse_timestamp(request.end_time),
        )
        if timestamp is not None
    ]

    return SynapseWorkloadProfile(
        collection_status="collected",
        description="Dedicated SQL pool workload activity collected successfully.",
        configured_window_days=window_days,
        configured_top_n=top_n,
        sql_text_redacted=sql_text_redacted,
        collected_at=collected_at.isoformat(),
        observed_start=(
            min(request_timestamps).isoformat() if request_timestamps else None
        ),
        observed_end=(
            max(request_timestamps).isoformat() if request_timestamps else None
        ),
        request_count=len(requests),
        session_count=len(sessions),
        peak_concurrency=calculate_peak_concurrency(requests, collected_at),
        status_distribution=dict(
            sorted(Counter(request.status or "Unknown" for request in requests).items())
        ),
        resource_class_distribution=dict(
            sorted(
                Counter(
                    request.resource_class or "Unknown" for request in requests
                ).items()
            )
        ),
        duration_statistics=calculate_duration_statistics(requests),
        temporal_buckets=calculate_temporal_buckets(requests),
        requests=requests,
        sessions=sessions,
    )


def unavailable_workload_profile(
    status: str,
    description: str,
    window_days: int,
    top_n: int,
    sql_text_redacted: bool,
    collected_at: datetime,
) -> SynapseWorkloadProfile:
    return SynapseWorkloadProfile(
        collection_status=status,
        description=description,
        configured_window_days=window_days,
        configured_top_n=top_n,
        sql_text_redacted=sql_text_redacted,
        collected_at=collected_at.isoformat(),
        observed_start=None,
        observed_end=None,
        request_count=0,
        session_count=0,
        peak_concurrency=0,
        status_distribution={},
        resource_class_distribution={},
        duration_statistics=SynapseDurationStatistics(None, None, None, None, None),
        temporal_buckets=[],
        requests=[],
        sessions=[],
    )
