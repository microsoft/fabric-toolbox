from dbt.tests.adapter.query_comment.test_query_comment import (
    BaseEmptyQueryComments,
    BaseMacroArgsQueryComments,
    BaseMacroInvalidQueryComments,
    BaseMacroQueryComments,
    BaseNullQueryComments,
    BaseQueryComments,
)


class TestQueryCommentsFabricSpark(BaseQueryComments):
    pass


class TestMacroQueryCommentsFabricSpark(BaseMacroQueryComments):
    pass


class TestMacroArgsQueryCommentsFabricSpark(BaseMacroArgsQueryComments):
    pass


class TestMacroInvalidQueryCommentsFabricSpark(BaseMacroInvalidQueryComments):
    pass


class TestNullQueryCommentsFabricSpark(BaseNullQueryComments):
    pass


class TestEmptyQueryCommentsFabricSpark(BaseEmptyQueryComments):
    pass
