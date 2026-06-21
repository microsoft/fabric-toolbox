import pytest

from dbt.tests.adapter.utils.test_split_part import BaseSplitPart

seeds__data_split_part_csv = """parts,split_on,result_1,result_2,result_3,result_4
a|b|c,|,a,b,c,c
1|2|3,|,1,2,3,3
EMPTY|EMPTY|EMPTY,|,EMPTY,EMPTY,EMPTY,EMPTY
"""


class TestSplitPartFabricSpark(BaseSplitPart):
    @pytest.fixture(scope="class")
    def seeds(self):
        return {"data_split_part.csv": seeds__data_split_part_csv}
