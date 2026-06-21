import pytest

from dbt.tests.adapter.utils.test_last_day import BaseLastDay

seeds__data_last_day_csv = """date_day,date_part,result
2018-01-02,month,2018-01-31
2018-01-02,quarter,2018-03-31
2018-01-02,year,2018-12-31
"""


class TestLastDayFabricSpark(BaseLastDay):
    @pytest.fixture(scope="class")
    def seeds(self):
        return {"data_last_day.csv": seeds__data_last_day_csv}
