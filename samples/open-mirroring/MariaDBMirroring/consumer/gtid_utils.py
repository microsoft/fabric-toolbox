"""
GTID (Global Transaction ID) utilities for consistent snapshot-based CDC.

This module provides functions to capture GTID positions at the time of
snapshots, ensuring that the consumer can reliably match incremental changes
from Kafka with the snapshot baseline.

MariaDB GTID Format: domain-server_id-sequence
Example: 0-1-1234,1-2-5678

The GTID position tells you the last committed transaction at that moment.
All Kafka events with GTID > snapshot GTID occurred AFTER the snapshot.
"""

import logging
from typing import Optional, Tuple
import pymysql

LOGGER = logging.getLogger("mariadb_fabric_mirror")


def get_gtid_position(connection) -> Optional[str]:
    """
    Get the current GTID (Global Transaction ID) position.
    
    This should be called within a transaction started with:
        START TRANSACTION WITH CONSISTENT SNAPSHOT;
    
    Args:
        connection: Active pymysql connection
        
    Returns:
        GTID position string (e.g., "0-1-1234,1-2-5678") or None if not available
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT @@global.gtid_binlog_pos")
            result = cursor.fetchone()
            if result:
                return result.get("@@global.gtid_binlog_pos")
            return None
    except Exception as e:
        LOGGER.warning("Failed to retrieve GTID position: %s", e)
        return None


def create_snapshot_table_rows_with_gtid(
    connection,
    schema_name: str,
    table_name: str,
) -> Tuple[list, dict, Optional[str]]:
    """
    Create snapshot rows for a table within a consistent snapshot transaction.
    
    IMPORTANT: Call this AFTER starting:
        START TRANSACTION WITH CONSISTENT SNAPSHOT;
        
    The GTID position returned is captured BEFORE reading the tables,
    ensuring all data is at or after this GTID mark.
    
    Args:
        connection: pymysql connection with autocommit=False (manual transaction mode)
        schema_name: Database schema name
        table_name: Table name
        
    Returns:
        Tuple of (snapshot_rows list, column_types dict, gtid_position string)
    """
    try:
        # Get GTID at the moment of consistent snapshot
        gtid_position = get_gtid_position(connection)
        if gtid_position:
            LOGGER.info(
                "Snapshot GTID position for %s.%s: %s",
                schema_name,
                table_name,
                gtid_position,
            )
        
        # Now read the table data (still within consistent snapshot)
        quoted_table = f"`{schema_name.replace(chr(96), '')}`.`{table_name.replace(chr(96), '')}`"
        with connection.cursor() as cursor:
            cursor.execute(f"DESCRIBE {quoted_table}")
            describe_rows = cursor.fetchall()
            
            column_types = {}
            for row in describe_rows:
                field_name = row["Field"]
                field_type = str(row["Type"]).lower()
                column_types[field_name] = _parse_mysql_column_type(field_type)
            
            cursor.execute(f"SELECT * FROM {quoted_table}")
            result_rows = cursor.fetchall()
        
        snapshot_rows = []
        for row in result_rows:
            snapshot_row = dict(row)
            snapshot_row["__rowMarker__"] = 0  # Insert marker for snapshot
            snapshot_rows.append(snapshot_row)
        
        return snapshot_rows, column_types, gtid_position
        
    except Exception as e:
        LOGGER.error(
            "Error creating snapshot for %s.%s: %s",
            schema_name,
            table_name,
            e,
        )
        raise


def _parse_mysql_column_type(raw_type: str) -> str:
    """
    Map MySQL column types to Python/Arrow data types.
    Used by create_snapshot_table_rows_with_gtid.
    """
    value = raw_type.lower()
    
    if any(token in value for token in ["bigint", "int", "smallint", "tinyint", "mediumint"]):
        return "int64"
    if any(token in value for token in ["decimal", "numeric", "float", "double", "real"]):
        return "float64"
    if value.startswith("bool") or value.startswith("boolean"):
        return "bool"
    if any(token in value for token in ["date", "time", "year"]):
        return "datetime"
    return "string"


def gtid_compare(gtid1: Optional[str], gtid2: Optional[str]) -> int:
    """
    Compare two GTID positions.
    
    LIMITATION: This is a simple string comparison and works for single-domain GTIDs.
    For multi-domain GTIDs (comma-separated), this is a best-effort comparison.
    
    Args:
        gtid1: First GTID position
        gtid2: Second GTID position
        
    Returns:
        -1 if gtid1 < gtid2
         0 if gtid1 == gtid2
         1 if gtid1 > gtid2
        -1 if either is None or comparison fails
    """
    if not gtid1 or not gtid2:
        return -1
    
    try:
        # For simple single-domain GTIDs like "0-1-100", compare sequence numbers
        parts1 = gtid1.split("-")
        parts2 = gtid2.split("-")
        
        if len(parts1) == 3 and len(parts2) == 3:
            seq1 = int(parts1[2])
            seq2 = int(parts2[2])
            
            if seq1 < seq2:
                return -1
            elif seq1 > seq2:
                return 1
            else:
                return 0
        
        # Fallback to string comparison for multi-domain GTIDs
        if gtid1 < gtid2:
            return -1
        elif gtid1 > gtid2:
            return 1
        else:
            return 0
            
    except Exception as e:
        LOGGER.warning("Error comparing GTIDs '%s' vs '%s': %s", gtid1, gtid2, e)
        return -1


def create_gtid_aware_snapshot(
    source_host: str,
    source_port: int,
    source_user: str,
    source_password: str,
    source_database: str,
    schema_name: str,
    table_name: str,
) -> Tuple[list, dict, Optional[str]]:
    """
    Create a complete GTID-aware snapshot for a single table.
    
    This function handles the connection and transaction lifecycle:
    1. Connects to source database
    2. Starts a consistent snapshot transaction
    3. Captures GTID position
    4. Reads table data
    5. Commits and closes connection
    
    Args:
        source_host: MariaDB host
        source_port: MariaDB port
        source_user: Database user
        source_password: Database password
        source_database: Database name
        schema_name: Schema (database) name
        table_name: Table name
        
    Returns:
        Tuple of (snapshot_rows list, column_types dict, gtid_position string)
    """
    connection = None
    try:
        connection = pymysql.connect(
            host=source_host,
            port=source_port,
            user=source_user,
            password=source_password,
            database=source_database,
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,  # Manual transaction control
        )
        
        # Start consistent snapshot transaction
        with connection.cursor() as cursor:
            cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT")
        
        # Create snapshot rows with GTID
        rows, col_types, gtid_pos = create_snapshot_table_rows_with_gtid(
            connection,
            schema_name,
            table_name,
        )
        
        # Commit the transaction
        connection.commit()
        
        return rows, col_types, gtid_pos
        
    except Exception as e:
        if connection:
            connection.rollback()
        LOGGER.error(
            "Error in create_gtid_aware_snapshot for %s.%s: %s",
            schema_name,
            table_name,
            e,
        )
        raise
        
    finally:
        if connection:
            connection.close()
