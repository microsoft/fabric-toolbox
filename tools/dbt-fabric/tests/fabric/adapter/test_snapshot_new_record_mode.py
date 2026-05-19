import pytest

from dbt.tests.util import check_relations_equal, run_dbt

_seed_new_record_mode = """
create table {database}.{schema}.seed (
    id INTEGER,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(50),
    gender VARCHAR(50),
    ip_address VARCHAR(20),
    updated_at DATETIME2(6)
);

create table {database}.{schema}.snapshot_expected (
    id INTEGER,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(50),
    gender VARCHAR(50),
    ip_address VARCHAR(20),

    -- snapshotting fields
    updated_at DATETIME2(6),
    dbt_valid_from DATETIME2(6),
    dbt_valid_to   DATETIME2(6),
    dbt_scd_id     VARCHAR(50),
    dbt_updated_at DATETIME2(6),
    dbt_is_deleted VARCHAR(50)
);


-- seed inserts
--  use the same email for two users to verify that duplicated check_cols values
--  are handled appropriately
insert into {database}.{schema}.seed (id, first_name, last_name, email, gender, ip_address, updated_at) values
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


-- populate snapshot table
insert into {database}.{schema}.snapshot_expected (
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    dbt_valid_from,
    dbt_valid_to,
    dbt_updated_at,
    dbt_scd_id,
    dbt_is_deleted
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
    updated_at as dbt_valid_from,
    cast(null as date) as dbt_valid_to,
    updated_at as dbt_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id as varchar(8000)), '') + '-' + coalesce(cast(first_name as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as dbt_scd_id,
    'False' as dbt_is_deleted
from {database}.{schema}.seed;
"""

_snapshot_actual_sql = """
{% snapshot snapshot_actual %}

    {{
        config(
            unique_key='cast(id as varchar(8000)) + '~ "'-'" ~ ' + cast(first_name as varchar(8000))',
        )
    }}
    select * from "{{target.database}}"."{{target.schema}}".seed

{% endsnapshot %}
"""

_snapshots_yml = """
snapshots:
  - name: snapshot_actual
    config:
      strategy: timestamp
      updated_at: updated_at
      hard_deletes: new_record
"""

_ref_snapshot_sql = """
select * from {{ ref('snapshot_actual') }}
"""


_invalidate_sql = """
-- update records 11 - 21. Change email and updated_at field
update {schema}.seed set
updated_at = CAST(DATEADD(HOUR, 1, updated_at) AS datetime2(6)),
email      =  case when id = 20 then 'pfoxj@creativecommons.org' else 'new_' + email end
where id >= 10 and id <= 20;


-- invalidate records 11 - 21
update {schema}.snapshot_expected set
dbt_valid_to   = CAST(DATEADD(HOUR, 1, updated_at) AS datetime2(6))
where id >= 10 and id <= 20;

"""

_update_sql = """
-- insert v2 of the 11 - 21 records

insert into {database}.{schema}.snapshot_expected (
    id,
    first_name,
    last_name,
    email,
    gender,
    ip_address,
    updated_at,
    dbt_valid_from,
    dbt_valid_to,
    dbt_updated_at,
    dbt_scd_id,
    dbt_is_deleted
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
    updated_at as dbt_valid_from,
    cast(null as date) as dbt_valid_to,
    updated_at as dbt_updated_at,
    convert(varchar(50), hashbytes('md5', coalesce(cast(id as varchar(8000)), '') + '-' + coalesce(cast(first_name as varchar(8000)), '') + '|' + coalesce(cast(updated_at as varchar(8000)), '')), 2) as dbt_scd_id,
    'False' as dbt_is_deleted
from {database}.{schema}.seed
where id >= 10 and id <= 20;
"""

_delete_sql = """
delete from {schema}.seed where id = 1
"""


class SnapshotNewRecordMode:
    @pytest.fixture(scope="class")
    def snapshots(self):
        return {"snapshot.sql": _snapshot_actual_sql}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "snapshots.yml": _snapshots_yml,
            "ref_snapshot.sql": _ref_snapshot_sql,
        }

    @pytest.fixture(scope="class")
    def seed_new_record_mode(self):
        return _seed_new_record_mode

    @pytest.fixture(scope="class")
    def invalidate_sql(self):
        return _invalidate_sql

    @pytest.fixture(scope="class")
    def update_sql(self):
        return _update_sql

    @pytest.fixture(scope="class")
    def delete_sql(self):
        return _delete_sql

    def test_snapshot_new_record_mode(
        self, project, seed_new_record_mode, invalidate_sql, update_sql
    ):
        project.run_sql(seed_new_record_mode)
        results = run_dbt(["snapshot"])
        assert len(results) == 1

        project.run_sql(invalidate_sql)
        project.run_sql(update_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1

        check_relations_equal(project.adapter, ["snapshot_actual", "snapshot_expected"])

        project.run_sql(_delete_sql)

        results = run_dbt(["snapshot"])
        assert len(results) == 1


class TestSnapshotNewRecordMode(SnapshotNewRecordMode):
    pass
