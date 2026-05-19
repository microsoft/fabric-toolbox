from dbt.adapters.fabric.livy_result import LivySessionResult


class TestLivySessionResultToSubmissionResult:
    def test_maps_fields_correctly(self):
        result = LivySessionResult(
            statement_id=42,
            success=True,
            error_message=None,
            status_code="ok",
            json_data={"key": "value"},
        )

        submission = result.to_submission_result("print('hello')")

        assert submission.run_id == "42"
        assert submission.compiled_code == "print('hello')"
        assert submission.success is True
        assert submission.error_message is None

    def test_maps_failed_result(self):
        result = LivySessionResult(
            statement_id=7,
            success=False,
            error_message="something broke",
            status_code="error",
        )

        submission = result.to_submission_result("bad code")

        assert submission.run_id == "7"
        assert submission.compiled_code == "bad code"
        assert submission.success is False
        assert submission.error_message == "something broke"
