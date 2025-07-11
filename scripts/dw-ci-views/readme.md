# Case-Insensitive Views

The SQL Analyitics Endpoint (SQL AE) can only be created with a case-sensitive collation.  This is causing some issues when quering the data, adding a collation or LCASE/UCASE to the queries is not always practical. 

So by creating views in the SQL AE, you can join the tables with tables in a case-insensitive Fabric warehouse without collation issues.

This will work on SQL AE for Lakehouses but also on Mirrored databases.

## Overview
This SQL script dynamically generates DDL (Data Definition Language) statements to create views for each table in a SQL Server database. Here's a breakdown of what it does:

## Purpose
It constructs a CREATE OR ALTER VIEW statement for every table in the database, placing the view in the same schema as the original table and prefixing the view name with vw_.

## How It Works
If a column is of type varchar, it appends a COLLATE Latin1_General_100_CI_AI_SC clause to ensure consistent collation in the view.

