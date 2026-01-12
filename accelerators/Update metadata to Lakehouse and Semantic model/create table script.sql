CREATE TABLE IF NOT EXISTS Policyholder (
    id BIGINT,
    name STRING,
    address STRING,
    city STRING,
    state STRING,
    phone STRING,
    email STRING,
    date_of_birth DATE
)
USING DELTA;

CREATE TABLE IF NOT EXISTS Vehicle (
    vin STRING,
    make STRING,
    model STRING,
    year INT
)
USING DELTA;

CREATE TABLE IF NOT EXISTS Policy (
    policy_number STRING,
    policyholder_id BIGINT,
    vehicle_vin STRING,
    start_date DATE,
    end_date DATE,
    coverage_type STRING,
    premium DOUBLE
)
USING DELTA;

CREATE TABLE IF NOT EXISTS Adjuster (
    id BIGINT,
    name STRING,
    phone STRING,
    email STRING
)
USING DELTA;

CREATE TABLE IF NOT EXISTS Accident (
    accident_id BIGINT,
    policyholder_id BIGINT,
    vehicle_vin STRING,
    accident_date DATE,
    location STRING,
    accident_type STRING,
    severity STRING
)
USING DELTA;

CREATE TABLE IF NOT EXISTS Claim (
    claim_number STRING,
    policy_number STRING,
    accident_id BIGINT,
    date_filed DATE,
    status STRING,
    adjuster_id BIGINT,
    claim_amount DOUBLE,
    payout_amount DOUBLE
)
USING DELTA;

CREATE TABLE IF NOT EXISTS Driver_Telemetry_Data (
    Trip_ID STRING,
    policyholder_id INT,
    vin STRING,
    Start_Time TIMESTAMP,
    End_Time TIMESTAMP,
    Start_Location_Lat DECIMAL(9,6),
    Start_Location_Lon DECIMAL(9,6),
    Time_of_Day_Category STRING,
    Duration_Min DECIMAL(8,2),
    Distance_Miles DECIMAL(8,2),
    Peak_High_Speed DECIMAL(6,2),
    Average_Speed DECIMAL(6,2),
    Peak_Low_Speed DECIMAL(6,2),
    Max_Speed_Limit_Exceeded DECIMAL(6,2),
    Sudden_Braking_Count INT,
    Rapid_Acceleration_Count INT,
    Harsh_Cornering_Count INT,
    Speeding_Incidents INT,
    Safety_Score DECIMAL(5,2),
    Braking_Index DECIMAL(4,2),
    Acceleration_Index DECIMAL(4,2),
    Trip_Risk_Level STRING
)
USING DELTA;