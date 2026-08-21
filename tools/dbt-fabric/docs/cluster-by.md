# Data clustering

Fabric Data Warehouse supports [automatic data clustering](https://learn.microsoft.com/fabric/data-warehouse/statistics#automatic-clustering) via the `CLUSTER BY` clause on `CREATE TABLE` statements. Clustering organizes data physically on disk based on the specified columns, which can significantly improve query performance for filters and joins on those columns.

This adapter lets you configure clustering directly from your dbt model using the `cluster_by` config option.

---

## Usage

Add `cluster_by` to your model's config block. It accepts a single column name or a list of column names:

=== "Single column"

    ```sql title="models/orders.sql"
    {{ config(
        materialized='table',
        cluster_by='order_date'
    ) }}

    select
        order_id,
        order_date,
        customer_id,
        total_amount
    from {{ source('raw', 'orders') }}
    ```

=== "Multiple columns"

    ```sql title="models/orders.sql"
    {{ config(
        materialized='table',
        cluster_by=['customer_id', 'order_date']
    ) }}

    select
        order_id,
        order_date,
        customer_id,
        total_amount
    from {{ source('raw', 'orders') }}
    ```

=== "In dbt_project.yml"

    ```yaml title="dbt_project.yml"
    models:
      my_project:
        marts:
          +cluster_by: ['customer_id', 'order_date']
    ```

The generated SQL will look like:

```sql
CREATE TABLE [schema].[orders]
WITH (CLUSTER BY ([customer_id], [order_date]))
AS select ...
```

---

## Works with incremental models

Clustering is also applied when incremental models create their initial table (full refresh or first run):

```sql title="models/orders_incremental.sql"
{{ config(
    materialized='incremental',
    unique_key='order_id',
    cluster_by=['order_date']
) }}

select
    order_id,
    order_date,
    customer_id,
    total_amount
from {{ source('raw', 'orders') }}
{% if is_incremental() %}
where order_date > (select max(order_date) from {{ this }})
{% endif %}
```

---

## When to use clustering

Clustering is most effective when:

- You frequently filter or join on specific columns (e.g. date columns, foreign keys)
- Your table is large enough that physical data organization matters
- The clustered columns have moderate cardinality

Fabric manages the clustering automatically after the initial `CLUSTER BY` declaration — there is no need to manually re-cluster or maintain the data layout.
