import datetime

import pytest

from dbt.artifacts.resources.v1.snapshot import SnapshotMetaColumnNames
from dbt.tests.util import (
    check_relations_equal,
    get_manifest,
    run_dbt,
    run_dbt_and_capture,
    run_sql_with_adapter,
    update_config_file,
)

model_seed_sql = """
select * from "{{target.database}}".{{target.schema}}.seed
"""

snapshots_multi_key_yml = """
snapshots:
  - name: snapshot_actual
    relation: "ref('seed')"
    config:
      strategy: timestamp
      updated_at: updated_at
      unique_key:
        - id1
        - id2
      snapshot_meta_column_names:
          dbt_valid_to: test_valid_to
          dbt_valid_from: test_valid_from
          dbt_scd_id: test_scd_id
          dbt_updated_at: test_updated_at
"""

# multi-key snapshot fixtures

create_multi_key_seed_sql = """
create table {schema}.seed (
    id1 INTEGER,
    id2 INTEGER,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(50),
    gender VARCHAR(50),
    ip_address VARCHAR(20),
    updated_at DATETIME2(6)
);
"""

create_multi_key_snapshot_expected_sql = """
create table {schema}.snapshot_expected (
    id1 INTEGER,
    id2 INTEGER,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(50),
    gender VARCHAR(50),
    ip_address VARCHAR(20),

    -- snapshotting fields
    updated_at DATETIME2(6),
    test_valid_from DATETIME2(6),
    test_valid_to   DATETIME2(6),
    test_scd_id     VARCHAR(50),
    test_updated_at DATETIME2(6)
);
"""

seed_multi_key_insert_sql = """
-- seed inserts
--  use the same email for two users to verify that duplicated check_cols values
--  are handled appropriately
insert into {schema}.seed (id1, id2, first_name, last_name, email, gender, ip_address, updated_at) values
(1, 100,  'Judith', 'Kennedy', '(not provided)', 'Female', '54.60.24.128', '2015-12-24 12:19:28'),
(2, 200, 'Arthur', 'Kelly', '(not provided)', 'Male', '62.56.24.215', '2015-10-28 16:22:15'),
(3, 300, 'Rachel', 'Moreno', 'rmoreno2@msu.edu', 'Female', '31.222.249.23', '2016-04-05 02:05:30'),
(4, 400, 'Ralph', 'Turner', 'rturner3@hp.com', 'Male', '157.83.76.114', '2016-08-08 00:06:51'),
(5, 500, 'Laura', 'Gonzales', 'lgonzales4@howstuffworks.com', 'Female', '30.54.105.168', '2016-09-01 08:25:38'),
(6, 600, 'Katherine', 'Lopez', 'klopez5@yahoo.co.jp', 'Female', '169.138.46.89', '2016-08-30 18:52:11'),
(7, 700, 'Jeremy', 'Hamilton', 'jhamilton6@mozilla.org', 'Male', '231.189.13.133', '2016-07-17 02:09:46'),
(8, 800, 'Heather', 'Rose', 'hrose7@goodreads.com', 'Female', '87.165.201.65', '2015-12-29 22:03:56'),
(9, 900, 'Gregory', 'Kelly', 'gkelly8@trellian.com', 'Male', '154.209.99.7', '2016-03-24 21:18:16'),
(10, 1000, 'Rachel', 'Lopez', 'rlopez9@themeforest.net', 'Female', '237.165.82.71', '2016-08-20 15:44:49'),
(11, 1100, 'Donna', 'Welch', 'dwelcha@shutterfly.com', 'Female', '103.33.110.138', '2016-02-27 01:41:48'),
(12, 1200, 'Russell', 'Lawrence', 'rlawrenceb@qq.com', 'Male', '189.115.73.4', '2016-06-11 03:07:09'),
(13, 1300, 'Michelle', 'Montgomery', 'mmontgomeryc@scientificamerican.com', 'Female', '243.220.95.82', '2016-06-18 16:27:19'),
(14, 1400, 'Walter', 'Castillo', 'wcastillod@pagesperso-orange.fr', 'Male', '71.159.238.196', '2016-10-06 01:55:44'),
(15, 1500, 'Robin', 'Mills', 'rmillse@vkontakte.ru', 'Female', '172.190.5.50', '2016-10-31 11:41:21'),
(16, 1600, 'Raymond', 'Holmes', 'rholmesf@usgs.gov', 'Male', '148.153.166.95', '2016-10-03 08:16:38'),
(17, 1700, 'Gary', 'Bishop', 'gbishopg@plala.or.jp', 'Male', '161.108.182.13', '2016-08-29 19:35:20'),
(18, 1800, 'Anna', 'Riley', 'arileyh@nasa.gov', 'Female', '253.31.108.22', '2015-12-11 04:34:27'),
(19, 1900, 'Sarah', 'Knight', 'sknighti@foxnews.com', 'Female', '222.220.3.177', '2016-09-26 00:49:06'),
(20, 2000, 'Phyllis', 'Fox', null, 'Female', '163.191.232.95', '2016-08-21 10:35:19');
"""

populate_multi_key_snapshot_expected_sql = """
-- populate snapshot table
insert into {schema}.snapshot_expected (
    id1,
    id2,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    test_valid_from,
    test_valid_to,
    test_updated_at,
    test_scd_id
)

select
    id1,
    id2,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    -- fields added by snapshotting
    updated_at as test_valid_from,
    cast(null as Datetime2(6)) as test_valid_to,
    updated_at as test_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id1 as varchar(8000)), '') + '|' + coalesce(cast(id2 as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as test_scd_id
from {schema}.seed;
"""

model_seed_sql = """
select * from "{{target.database}}"."{{target.schema}}".seed
"""

snapshots_multi_key_yml = """
snapshots:
  - name: snapshot_actual
    relation: "ref('seed')"
    config:
      strategy: timestamp
      updated_at: updated_at
      unique_key:
        - id1
        - id2
      snapshot_meta_column_names:
          dbt_valid_to: test_valid_to
          dbt_valid_from: test_valid_from
          dbt_scd_id: test_scd_id
          dbt_updated_at: test_updated_at
"""

invalidate_multi_key_sql = """
-- update records 11 - 21. Change email and updated_at field
update {schema}.seed set
    updated_at = CAST(DATEADD(HOUR, 1, updated_at) AS datetime2(6)),
    email      =  case when id1 = 20 then 'pfoxj@creativecommons.org' else 'new_' + email end
where id1 >= 10 and id1 <= 20;


-- invalidate records 11 - 21
update {schema}.snapshot_expected set
    test_valid_to   = CAST(DATEADD(HOUR, 1, updated_at) AS datetime2(6))
where id1 >= 10 and id1 <= 20;

"""

update_multi_key_sql = """
-- insert v2 of the 11 - 21 records

insert into {schema}.snapshot_expected (
    id1,
    id2,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    test_valid_from,
    test_valid_to,
    test_updated_at,
    test_scd_id
)

select
    id1,
    id2,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    -- fields added by snapshotting
    updated_at as test_valid_from,
    cast(null as Datetime2(6)) as test_valid_to,
    updated_at as test_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id1 as varchar(8000)), '') + '|' + coalesce(cast(id2 as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as test_scd_id
from {schema}.seed
where id1 >= 10 and id1 <= 20;
"""

snapshot_actual_sql = """
{% snapshot snapshot_actual %}

    {{
        config(
            unique_key='cast(id as varchar(8000)) + '~ "'-'" ~ ' + cast(first_name as varchar(8000))',
        )
    }}

    select * from "{{target.database}}"."{{target.schema}}".seed

{% endsnapshot %}
"""

snapshots_valid_to_current_yml = """
snapshots:
  - name: snapshot_actual
    config:
      strategy: timestamp
      updated_at: updated_at
      dbt_valid_to_current: "cast('2099-12-31' as date)"
      snapshot_meta_column_names:
          dbt_valid_to: test_valid_to
          dbt_valid_from: test_valid_from
          dbt_scd_id: test_scd_id
          dbt_updated_at: test_updated_at
"""

ref_snapshot_sql = """
select * from {{ ref('snapshot_actual') }}
"""

create_seed_sql = """
create table {schema}.seed (
    id INT,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(50),
    gender VARCHAR(50),
    ip_address VARCHAR(20),
    updated_at DATETIME2(6)
);
"""

create_snapshot_expected_sql = """
create table {schema}.snapshot_expected (
    id INT,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(50),
    gender VARCHAR(50),
    ip_address VARCHAR(20),

    -- snapshotting fields
    updated_at DATETIME2(6),
    test_valid_from DATETIME2(6),
    test_valid_to   DATETIME2(6),
    test_scd_id     VARCHAR(50),
    test_updated_at DATETIME2(6)
);
"""

seed_insert_sql = """
-- seed inserts
--  use the same email for two users to verify that duplicated check_cols values
--  are handled appropriately
insert into {schema}.seed (id, first_name, last_name, email, gender, ip_address, updated_at) values
(1, 'Judith', 'Kennedy', '(not provided)', 'Female', '54.60.24.128', '2015-12-24 12:19:28'),
(2, 'Arthur', 'Kelly', '(not provided)', 'Male', '62.56.24.215', '2015-10-28 16:22:15'),
(3, 'Rachel', 'Moreno', 'rmoreno2@msu.edu', 'Female', '31.222.249.23', '2016-04-05 02:05:30'),
(4, 'Ralph', 'Turner', 'rturner3@hp.com', 'Male', '157.83.76.114', '2016-08-08 00:06:51'),
(5, 'Laura', 'Gonzales', 'lgonzales4@howstuffworks.com', 'Female', '30.54.105.168', '2016-09-01 08:25:38'),
(6, 'Katherine', 'Lopez', 'klopez5@yahoo.co.jp', 'Female', '169.138.46.89', '2016-08-30 18:52:11'),
(7, 'Jeremy', 'Hamilton', 'jhamilton6@mozilla.org', 'Male', '231.189.13.133', '2016-07-17 02:09:46'),
(8, 'Heather', 'Rose', 'hrose7@goodreads.com', 'Female', '87.165.201.65', '2015-12-29 22:03:56'),
(9, 'Gregory', 'Kelly', 'gkelly8@trellian.com', 'Male', '154.209.99.7', '2016-03-24 21:18:16'),
(10, 'Rachel', 'Lopez', 'rlopez9@themeforest.net', 'Female', '237.165.82.71', '2016-08-20 15:44:49'),
(11, 'Donna', 'Welch', 'dwelcha@shutterfly.com', 'Female', '103.33.110.138', '2016-02-27 01:41:48'),
(12, 'Russell', 'Lawrence', 'rlawrenceb@qq.com', 'Male', '189.115.73.4', '2016-06-11 03:07:09'),
(13, 'Michelle', 'Montgomery', 'mmontgomeryc@scientificamerican.com', 'Female', '243.220.95.82', '2016-06-18 16:27:19'),
(14, 'Walter', 'Castillo', 'wcastillod@pagesperso-orange.fr', 'Male', '71.159.238.196', '2016-10-06 01:55:44'),
(15, 'Robin', 'Mills', 'rmillse@vkontakte.ru', 'Female', '172.190.5.50', '2016-10-31 11:41:21'),
(16, 'Raymond', 'Holmes', 'rholmesf@usgs.gov', 'Male', '148.153.166.95', '2016-10-03 08:16:38'),
(17, 'Gary', 'Bishop', 'gbishopg@plala.or.jp', 'Male', '161.108.182.13', '2016-08-29 19:35:20'),
(18, 'Anna', 'Riley', 'arileyh@nasa.gov', 'Female', '253.31.108.22', '2015-12-11 04:34:27'),
(19, 'Sarah', 'Knight', 'sknighti@foxnews.com', 'Female', '222.220.3.177', '2016-09-26 00:49:06'),
(20, 'Phyllis', 'Fox', null, 'Female', '163.191.232.95', '2016-08-21 10:35:19');
"""

populate_snapshot_expected_valid_to_current_sql = """
-- populate snapshot table
insert into {schema}.snapshot_expected (
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    test_valid_from,
    test_valid_to,
    test_updated_at,
    test_scd_id
)

select
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    -- fields added by snapshotting
    updated_at as test_valid_from,
    cast('2099-12-31' as date) as test_valid_to,
    updated_at as test_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id as varchar(8000)), '') + '-' + coalesce(cast(first_name as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as test_scd_id
from {schema}.seed;
"""

populate_snapshot_expected_sql = """
-- populate snapshot table
insert into {schema}.snapshot_expected (
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    test_valid_from,
    test_valid_to,
    test_updated_at,
    test_scd_id
)

select
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    -- fields added by snapshotting
    updated_at as test_valid_from,
    cast(null as date)  as test_valid_to,
    updated_at as test_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id as varchar(8000)), '') + '-' + coalesce(cast(first_name as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as test_scd_id
from {schema}.seed;
"""

update_with_current_sql = """
-- insert v2 of the 11 - 21 records

insert into {schema}.snapshot_expected (
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    test_valid_from,
    test_valid_to,
    test_updated_at,
    test_scd_id
)

select
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    -- fields added by snapshotting
    updated_at as test_valid_from,
    cast('2099-12-31' as date) as test_valid_to,
    updated_at as test_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id as varchar(8000)), '') + '-' + coalesce(cast(first_name as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as test_scd_id
from {schema}.seed
where id >= 10 and id <= 20;
"""

invalidate_sql = """
-- update records 11 - 21. Change email and updated_at field
update {schema}.seed set
    updated_at = CAST(DATEADD(HOUR, 1, updated_at) AS datetime2(6)),
    email      =  case when id = 20 then 'pfoxj@creativecommons.org' else 'new_' + email end
where id >= 10 and id <= 20;

-- invalidate records 11 - 21
update {schema}.snapshot_expected set
    test_valid_to   = CAST(DATEADD(HOUR, 1, updated_at) AS datetime2(6))
where id >= 10 and id <= 20;
"""

snapshots_no_column_names_yml = """
snapshots:
  - name: snapshot_actual
    config:
      strategy: timestamp
      updated_at: updated_at
"""

ref_snapshot_sql = """
select * from {{ ref('snapshot_actual') }}
"""

update_sql = """
-- insert v2 of the 11 - 21 records

insert into {schema}.snapshot_expected (
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    test_valid_from,
    test_valid_to,
    test_updated_at,
    test_scd_id
)

select
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    -- fields added by snapshotting
    updated_at as test_valid_from,
    cast (null as date) as test_valid_to,
    updated_at as test_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id as varchar(8000)), '') + '-' + coalesce(cast(first_name as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as test_scd_id
from {schema}.seed
where id >= 10 and id <= 20;
"""

snapshots_yml = """
snapshots:
  - name: snapshot_actual
    config:
      strategy: timestamp
      updated_at: updated_at
      snapshot_meta_column_names:
          dbt_valid_to: test_valid_to
          dbt_valid_from: test_valid_from
          dbt_scd_id: test_scd_id
          dbt_updated_at: test_updated_at
"""


class BaseSnapshotDbtValidToCurrent:
    @pytest.fixture(scope="class")
    def snapshots(self):
        return {"snapshot.sql": snapshot_actual_sql}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "snapshots.yml": snapshots_valid_to_current_yml,
            "ref_snapshot.sql": ref_snapshot_sql,
        }

    def test_valid_to_current(self, project):
        project.run_sql(create_seed_sql)
        project.run_sql(create_snapshot_expected_sql)
        project.run_sql(seed_insert_sql)
        project.run_sql(populate_snapshot_expected_valid_to_current_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        original_snapshot = run_sql_with_adapter(
            project.adapter,
            "select id, test_scd_id, test_valid_to from {schema}.snapshot_actual",
            "all",
        )
        assert original_snapshot[0][2] == datetime.datetime(2099, 12, 31, 0, 0)
        assert original_snapshot[9][2] == datetime.datetime(2099, 12, 31, 0, 0)

        project.run_sql(invalidate_sql)
        project.run_sql(update_with_current_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        updated_snapshot = run_sql_with_adapter(
            project.adapter,
            "select id, test_scd_id, test_valid_to from {schema}.snapshot_actual",
            "all",
        )
        assert len(updated_snapshot) == 31

        updated_snapshot_row_count = run_sql_with_adapter(
            project.adapter,
            "select count(*) from {schema}.snapshot_actual where test_valid_to != '2099-12-31 00:00:00.000000'",
            "all",
        )
        assert updated_snapshot_row_count[0][0] == 11

        updated_snapshot_row_17 = run_sql_with_adapter(
            project.adapter,
            "select id from {schema}.snapshot_actual where test_valid_to = '2016-08-29 20:35:20.000000'",
            "all",
        )
        assert updated_snapshot_row_17[0][0] == 17

        updated_snapshot_row_16 = run_sql_with_adapter(
            project.adapter,
            "select id from {schema}.snapshot_actual where test_valid_to = '2016-10-03 09:16:38.000000'",
            "all",
        )
        assert updated_snapshot_row_16[0][0] == 16
        check_relations_equal(project.adapter, ["snapshot_actual", "snapshot_expected"])


class TestSnapshotDbtValidToCurrent(BaseSnapshotDbtValidToCurrent):
    pass


class BaseSnapshotColumnNamesFromDbtProject:
    @pytest.fixture(scope="class")
    def snapshots(self):
        return {"snapshot.sql": snapshot_actual_sql}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "snapshots.yml": snapshots_no_column_names_yml,
            "ref_snapshot.sql": ref_snapshot_sql,
        }

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "snapshots": {
                "test": {
                    "+snapshot_meta_column_names": {
                        "dbt_valid_to": "test_valid_to",
                        "dbt_valid_from": "test_valid_from",
                        "dbt_scd_id": "test_scd_id",
                        "dbt_updated_at": "test_updated_at",
                    }
                }
            }
        }

    def test_snapshot_column_names_from_project(self, project):
        project.run_sql(create_seed_sql)
        project.run_sql(create_snapshot_expected_sql)
        project.run_sql(seed_insert_sql)
        project.run_sql(populate_snapshot_expected_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        project.run_sql(invalidate_sql)
        project.run_sql(update_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        check_relations_equal(project.adapter, ["snapshot_actual", "snapshot_expected"])


class TestBaseSnapshotColumnNamesFromDbtProject(BaseSnapshotColumnNamesFromDbtProject):
    pass


class BaseSnapshotColumnNames:
    @pytest.fixture(scope="class")
    def snapshots(self):
        return {"snapshot.sql": snapshot_actual_sql}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "snapshots.yml": snapshots_yml,
            "ref_snapshot.sql": ref_snapshot_sql,
        }

    def test_snapshot_column_names(self, project):
        project.run_sql(create_seed_sql)
        project.run_sql(create_snapshot_expected_sql)
        project.run_sql(seed_insert_sql)
        project.run_sql(populate_snapshot_expected_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        project.run_sql(invalidate_sql)
        project.run_sql(update_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        check_relations_equal(project.adapter, ["snapshot_actual", "snapshot_expected"])


class TestBaseSnapshotColumnNames(BaseSnapshotColumnNames):
    pass


class BaseSnapshotInvalidColumnNames:
    @pytest.fixture(scope="class")
    def snapshots(self):
        return {"snapshot.sql": snapshot_actual_sql}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "snapshots.yml": snapshots_no_column_names_yml,
            "ref_snapshot.sql": ref_snapshot_sql,
        }

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "snapshots": {
                "test": {
                    "+snapshot_meta_column_names": {
                        "dbt_valid_to": "test_valid_to",
                        "dbt_valid_from": "test_valid_from",
                        "dbt_scd_id": "test_scd_id",
                        "dbt_updated_at": "test_updated_at",
                    }
                }
            }
        }

    def test_snapshot_invalid_column_names(self, project):
        project.run_sql(create_seed_sql)
        project.run_sql(create_snapshot_expected_sql)
        project.run_sql(seed_insert_sql)
        project.run_sql(populate_snapshot_expected_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1
        manifest = get_manifest(project.project_root)
        snapshot_node = manifest.nodes["snapshot.test.snapshot_actual"]
        assert snapshot_node.config.snapshot_meta_column_names == SnapshotMetaColumnNames(
            dbt_valid_to="test_valid_to",
            dbt_valid_from="test_valid_from",
            dbt_scd_id="test_scd_id",
            dbt_updated_at="test_updated_at",
        )

        project.run_sql(invalidate_sql)
        project.run_sql(update_sql)

        # Change snapshot_meta_columns and look for an error
        different_columns = {
            "snapshots": {
                "test": {
                    "+snapshot_meta_column_names": {
                        "dbt_valid_to": "test_valid_to",
                        "dbt_updated_at": "test_updated_at",
                    }
                }
            }
        }
        update_config_file(different_columns, "dbt_project.yml")

        results, log_output = run_dbt_and_capture(["snapshot"], expect_pass=False)
        assert len(results) == 1
        assert "dbt_scd_id" in log_output
        assert "1 of 1 ERROR snapshotting test" in log_output


class TestBaseSnapshotInvalidColumnNames(BaseSnapshotInvalidColumnNames):
    pass


# This uses snapshot_meta_column_names, yaml-only snapshot def,
# and multiple keys
class BaseSnapshotMultiUniqueKey:
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "seed.sql": model_seed_sql,
            "snapshots.yml": snapshots_multi_key_yml,
            "ref_snapshot.sql": ref_snapshot_sql,
        }

    def test_multi_column_unique_key(self, project):
        project.run_sql(create_multi_key_seed_sql)
        project.run_sql(create_multi_key_snapshot_expected_sql)
        project.run_sql(seed_multi_key_insert_sql)
        project.run_sql(populate_multi_key_snapshot_expected_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        project.run_sql(invalidate_multi_key_sql)
        project.run_sql(update_multi_key_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        check_relations_equal(project.adapter, ["snapshot_actual", "snapshot_expected"])


class TestBaseSnapshotMultiUniqueKey(BaseSnapshotMultiUniqueKey):
    pass
