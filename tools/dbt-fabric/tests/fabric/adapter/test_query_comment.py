import json

from dbt.tests.adapter.query_comment.test_query_comment import (
    BaseEmptyQueryComments,
    BaseMacroArgsQueryComments,
    BaseMacroInvalidQueryComments,
    BaseMacroQueryComments,
    BaseNullQueryComments,
    BaseQueryComments,
)


class TestQueryComments(BaseQueryComments):
    pass


class TestMacroQueryComments(BaseMacroQueryComments):
    pass


class TestMacroArgsQueryComments(BaseMacroArgsQueryComments):
    def test_matches_comment(self, project):
        logs = self.run_get_json()
        expected_dct = {
            "app": "dbt++",
            "macro_version": "0.1.0",
            "message": f"blah: {project.adapter.config.target_name}",
        }
        expected = rf"/* {json.dumps(expected_dct, sort_keys=True)} */\n".replace('"', r"\"")
        assert expected in logs


class TestMacroInvalidQueryComments(BaseMacroInvalidQueryComments):
    pass


class TestNullQueryComments(BaseNullQueryComments):
    pass


class TestEmptyQueryComments(BaseEmptyQueryComments):
    pass
