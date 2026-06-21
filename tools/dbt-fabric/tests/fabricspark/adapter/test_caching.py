from dbt.tests.adapter.caching.test_caching import (
    BaseCachingLowercaseModel,
    BaseCachingSelectedSchemaOnly,
    BaseCachingUppercaseModel,
    BaseNoPopulateCache,
)


class TestCachingLowerCaseModelFabricSpark(BaseCachingLowercaseModel):
    pass


class TestCachingUppercaseModelFabricSpark(BaseCachingUppercaseModel):
    pass


class TestCachingSelectedSchemaOnlyFabricSpark(BaseCachingSelectedSchemaOnly):
    pass


class TestNoPopulateCacheFabricSpark(BaseNoPopulateCache):
    pass
