# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "environment": {}
# META   }
# META }

# CELL ********************

import subprocess
import sys

result = subprocess.run(
    [sys.executable, "-m", "pip", "install", 
     "https://raw.githubusercontent.com/anumicrosoftlab/fabric-spark-monitoring/main/Recommender/spark_monitoring_analyzer-0.2.0-py3-none-any.whl"],
    capture_output=True, text=True
)
print(result.stdout)
print(result.stderr)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## ⚡ Spark Monitoring Analyzer
# 
# 📥 Reads raw Spark event logs from EventHouse, parses them per application and extracts execution metrics — CPU efficiency, parallelism, GC overhead, task skew, and driver vs. executor wall-clock split.
# 
# 🏆 Each application is scored 0–100, classified by workload type (`cpu_starved`, `memory_bound`, `driver_bound`, etc.), and run through a modified Amdahl's Law scaling simulation to predict job duration at executor multipliers (0.25× – 8×).
# 
# 🎯 Prioritized recommendations (🔴 CRITICAL → ⚫ LOW) are generated per application, formatted as plain-text blocks, and written to `sparklens_recommedations` in Kusto alongside metrics, stage summaries, scaling predictions, and Fabric/Delta best-practice checks in `fabric_recommedations`.

# MARKDOWN ********************

# # ⚙️ Chunk Size Configuration
# 
# ```python
# KUSTO_DB_SIZE_GB = 1  # ← your Spark Monitoring Kusto DB size in GB
# 
# # Size (GB)  │ Pool                      │ chunk_size │ Est. runtime
# # -----------┼───────────────────────────┼────────────┼─────────────
# # < 10       │ Medium  (56 GB driver)    │ 100        │ ~5 min
# # 10 – 100   │ Medium  (56 GB driver)    │ 20         │ ~30 min
# # > 100      │ Large   (112 GB driver) ⚠ │ 5          │ ~4–8 hrs
# 
# if KUSTO_DB_SIZE_GB < 10:
#     _chunk_size = 100
# elif KUSTO_DB_SIZE_GB < 100:
#     _chunk_size = 20
# else:
#     _chunk_size = 5
#     print("⚠️  Switch to Large node pool: Spark Settings → Node size → Large")
# 
# run(kusto_uri=kustoUri, database=database, chunk_size=_chunk_size)
# ```
# 
# > Unknown DB size? Use `chunk_size=20` — safe up to ~100 GB on a Medium node.

# CELL ********************

from spark_monitoring_analyzer import run

run(kusto_uri=kustoUri, database=database, chunk_size=30)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
