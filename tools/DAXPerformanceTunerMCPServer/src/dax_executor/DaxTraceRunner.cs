// ============================================================================
// DAX Executor - Trace Runner Component
// ============================================================================
// This file contains code derived from DAX Studio
// Original source: https://github.com/DaxStudio/DaxStudio
// Copyright: Darren Gosbell and DAX Studio contributors
// Licensed under: Microsoft Reciprocal License (Ms-RL)
// See LICENSE-MSRL.txt in this directory for full license text
//
// Derived components include:
// - Trace event setup and collection patterns (SetupTraceEvents, GetSupportedTraceEventClasses)
// - Server timings calculation algorithms (DaxStudioServerTimings class)
// - xmSQL query formatting and cleaning (CleanXmSqlQuery methods)
// - DMV-based column/table ID mapping (GetColumnIdToNameMapping, GetTableIdToNameMapping)
// ============================================================================

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Data;
using System.Linq;
using System.IO;
using System.Xml;
using System.Xml.XPath;
using Microsoft.AnalysisServices.AdomdClient;
using Microsoft.AnalysisServices;
using Serilog;
using SystemJsonSerializer = System.Text.Json.JsonSerializer;
using SystemJsonSerializerOptions = System.Text.Json.JsonSerializerOptions;
using System.Text.RegularExpressions;

namespace DaxExecutor
{
    public class DaxTraceRunner
    {
        private static readonly ILogger Log = Serilog.Log.ForContext<DaxTraceRunner>();

        // Configuration constants
        private const int TRACE_PING_INTERVAL_MS = 500;           // DAX Studio uses 500ms between pings
        private const int TRACE_EVENT_COLLECTION_DELAY_MS = 3000; // Wait time for trace events to arrive
        private const int DAX_COMMAND_TIMEOUT_SECONDS = 300;      // 5 minutes for large queries
        private const int TRACE_AUTO_STOP_HOURS = 1;              // Auto-stop trace after 1 hour
        private const int TRACE_PING_ITERATIONS = 5;              // Number of ping iterations to activate trace

        private static string CreateErrorResponse(Exception ex)
        {
            var errorResult = new
            {
                Result = new 
                { 
                    Status = "Error", 
                    ErrorMessage = ex.Message,
                    ErrorType = ex.GetType().Name
                },
                Performance = new 
                { 
                    TotalDurationMs = 0, 
                    Error = true,
                    ErrorMessage = ex.Message
                },
                EventDetails = new object[0]
            };

            return SystemJsonSerializer.Serialize(errorResult, new SystemJsonSerializerOptions { WriteIndented = true });
        }

        private static string BuildConnectionString(string dataSource, string datasetName, string accessToken)
        {
            // Desktop connection - no authentication
            if (dataSource.Contains("localhost:", StringComparison.OrdinalIgnoreCase))
            {
                return $"Data Source={dataSource};Initial Catalog={datasetName};";
            }
            // Cloud connection - use token
            return $"Data Source={dataSource};Initial Catalog={datasetName};Password={accessToken};";
        }

        public static async Task<string> RunTraceWithXmlaAsync(
            string accessToken,
            string xmlaServer,
            string datasetName,
            string daxQuery)
        {
            try
            {
                Log.Information("Starting server timing trace for XMLA server: {XmlaServer}, dataset: {DatasetName}", xmlaServer, datasetName);

                // Setup connection string using the provided XMLA server
                var connectionString = BuildConnectionString(xmlaServer, datasetName, accessToken);
                
                return await ExecuteTraceInternal(connectionString, daxQuery, accessToken, datasetName);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Error executing DAX query with XMLA trace");
                return CreateErrorResponse(ex);
            }
        }

        private static async Task<string> ExecuteTraceInternal(
            string connectionString,
            string daxQuery,
            string accessToken,
            string datasetName)
        {
            var collectedEvents = new List<TraceEvent>();
            var queryResult = new Dictionary<string, object>();
            var queryStartTime = DateTime.UtcNow;
            var queryEndTime = DateTime.UtcNow;
                
                string sessionId = "";
                string applicationName = "DaxExecutor";

                // Use proper using statements for automatic resource disposal
                using var queryConnection = new AdomdConnection(connectionString);
                queryConnection.Open();
                
                // Get session ID from the connection - this is crucial for trace filtering
                sessionId = queryConnection.SessionID;
                Log.Information("Query connection established. SessionID: {SessionId}", sessionId);

                // Get DMV mappings for cleaning xmSQL queries (like DAX Studio)
                var columnIdToNameMap = GetColumnIdToNameMapping(queryConnection);
                var tableIdToNameMap = GetTableIdToNameMapping(queryConnection);
                Log.Debug("Retrieved {ColumnCount} column mappings and {TableCount} table mappings", 
                    columnIdToNameMap.Count, tableIdToNameMap.Count);

                using var server = new Server();
                
                // CRITICAL: Set access token on server object for authentication
                server.AccessToken = new Microsoft.AnalysisServices.AccessToken(accessToken, DateTime.UtcNow.AddHours(1), "");
                server.Connect(connectionString);

                // Create trace with session-specific name (trace cleanup handled in finally block since it's not IDisposable)
                Log.Information("Setting up trace with session filtering...");
                var traceName = $"DaxExecutor_Session_{sessionId}_{Guid.NewGuid().ToString("N")[..8]}";
                Trace? trace = null;
                
                try
                {
                    trace = server.Traces.Add(traceName);
                    
                    // Apply session filter for accurate event collection
                    Log.Information("Applying session filter...");
                    trace.Filter = GetSessionIdFilter(sessionId, applicationName);
                    
                    // Set stop time for automatic cleanup
                    trace.StopTime = DateTime.UtcNow.AddHours(TRACE_AUTO_STOP_HOURS);

                    // Setup trace events for Server Timings
                    SetupTraceEvents(trace, queryConnection);

                    // 9. Setup trace event handler
                    trace.OnEvent += (sender, e) =>
                    {
                        try
                        {
                            // Filter out internal ping queries (DISCOVER_SESSIONS)
                            var textData = e.TextData?.ToString() ?? "";
                            if (textData.Contains("$SYSTEM.DISCOVER_SESSIONS") || textData.StartsWith("/* PING */"))
                            {
                                Log.Verbose("Skipping ping event: {EventClass}", e.EventClass);
                                return;
                            }

                            var traceEvent = new TraceEvent
                            {
                                EventClass = e.EventClass.ToString(),
                                StartTime = null,
                                EndTime = null,
                                Duration = null,
                                CpuTime = null,
                                TextData = textData,
                                DatabaseName = e.DatabaseName?.ToString(),
                                SessionId = e.SessionID?.ToString(),
                                ApplicationName = e.ApplicationName?.ToString(),
                                ObjectName = e.ObjectName?.ToString(),
                                ActivityId = e.SessionID?.ToString(), // Use SessionID as ActivityID may not be available
                                InternalBatchEvent = false
                            };
                            
                            // Safely try to get EventSubclass
                            try
                            {
                                traceEvent.EventSubclass = e.EventSubclass.ToString();
                            }
                            catch
                            {
                                traceEvent.EventSubclass = null;
                            }
                            
                            // Safely try to get StartTime
                            try
                            {
                                traceEvent.StartTime = e.StartTime;
                            }
                            catch
                            {
                                try
                                {
                                    traceEvent.StartTime = e.CurrentTime;
                                }
                                catch
                                {
                                    traceEvent.StartTime = DateTime.UtcNow;
                                }
                            }
                            
                            // Safely try to get EndTime
                            try
                            {
                                traceEvent.EndTime = e.EndTime;
                            }
                            catch
                            {
                                traceEvent.EndTime = null;
                            }
                            
                            // Safely try to get Duration
                            try
                            {
                                traceEvent.Duration = e.Duration;
                            }
                            catch
                            {
                                traceEvent.Duration = null;
                            }
                            
                            // Safely try to get CpuTime
                            try
                            {
                                traceEvent.CpuTime = e.CpuTime;
                            }
                            catch
                            {
                                traceEvent.CpuTime = null;
                            }
                            
                            // Calculate NetParallelDuration (defaults to Duration)
                            traceEvent.NetParallelDuration = traceEvent.Duration;
                            
                            collectedEvents.Add(traceEvent);
                            Log.Debug("Captured trace event: {EventClass}.{EventSubclass} - Duration: {Duration}ms - Session: {SessionId}", 
                                traceEvent.EventClass, traceEvent.EventSubclass ?? "N/A", traceEvent.Duration ?? 0, traceEvent.SessionId);
                        }
                        catch (Exception ex)
                        {
                            Log.Warning(ex, "Error processing trace event");
                        }
                    };

                    // Set trace stop time and start it
                    trace.StopTime = DateTime.UtcNow.AddHours(TRACE_AUTO_STOP_HOURS);
                    
                    Log.Information("Starting trace...");
                    trace.Start();

                    // CRITICAL: Clear cache before starting trace
                    Log.Information("Clearing dataset cache before executing query...");
                    await ClearDatasetCache(queryConnection, server, datasetName);

                    // CRITICAL: Ping the connection repeatedly to activate trace events
                    Log.Information("Pinging connection to activate trace events...");
                    for (int i = 0; i < 5; i++)
                    {
                        PingTraceConnection(queryConnection);
                        await Task.Delay(500); // Wait 500ms between pings (DAX Studio interval)
                    }

                    // 11. Execute the DAX query using the same session
                    Log.Information("Executing DAX query in session {SessionId}...", sessionId);
                    queryStartTime = DateTime.UtcNow;
                    try
                    {
                        using var command = new AdomdCommand(daxQuery, queryConnection);
                        command.CommandTimeout = DAX_COMMAND_TIMEOUT_SECONDS;

                        using var reader = command.ExecuteReader();
                        
                        // Get column information efficiently
                        var columns = new List<string>();
                        for (int i = 0; i < reader.FieldCount; i++)
                        {
                            columns.Add(reader.GetName(i));
                        }
                        int columnCount = reader.FieldCount;

                        // Get total row count first (efficient approach)
                        int totalRowCount = 0;
                        var allRows = new List<List<object>>();
                        
                        while (reader.Read())
                        {
                            totalRowCount++;
                            
                            var row = new List<object>();
                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                var value = reader.GetValue(i);
                                row.Add(value == DBNull.Value ? null! : value);
                            }
                            allRows.Add(row);
                        }

                        // Sort by each column in order
                        IOrderedEnumerable<List<object>> sortedQuery = allRows.OrderBy(row => row[0]);
                        for (int i = 1; i < columnCount; i++)
                        {
                            int columnIndex = i; // Capture for closure
                            sortedQuery = sortedQuery.ThenBy(row => row[columnIndex]);
                        }
                        var sortedRows = sortedQuery.ToList();

                        // Take only first 10 rows for sample data after sorting
                        var sampleRows = sortedRows.Take(10).ToList();

                        queryResult = new Dictionary<string, object>
                        {
                            ["Columns"] = columns,
                            ["RowCount"] = totalRowCount,        // ✅ Total row count (not truncated)
                            ["ColumnCount"] = columnCount,       // ✅ Direct column count
                            ["Rows"] = sampleRows                // ✅ Sample data (fixed field name)
                        };

                        Log.Information("Query executed successfully. Total Rows: {TotalRowCount}, Sample Rows: {SampleRowCount}", totalRowCount, sampleRows.Count);
                    }
                    finally
                    {
                        queryEndTime = DateTime.UtcNow;
                    }

                    // Wait for trace events to be collected
                    Log.Information("Waiting for trace events to be collected...");
                    await Task.Delay(TRACE_EVENT_COLLECTION_DELAY_MS);

                    Log.Information("Trace completed. Collected {EventCount} events", collectedEvents.Count);
                }
                finally
                {
                    // Cleanup trace (only resource not automatically handled by using statements)
                    if (trace != null)
                    {
                        Log.Information("Stopping trace...");
                        try { trace.Stop(); } 
                        catch (Exception ex) { Log.Warning(ex, "Failed to stop trace"); }
                        try { trace.Drop(); } 
                        catch (Exception ex) { Log.Warning(ex, "Failed to drop trace"); }
                    }
                    // Note: Server and AdomdConnection are automatically disposed by using statements
                }

                // Calculate performance metrics and event details using DAX Studio's exact logic
                var timings = DaxStudioServerTimings.Calculate(collectedEvents, queryStartTime, queryEndTime, columnIdToNameMap, tableIdToNameMap);

                // Return results in DAX Studio Server Timings format (property names and structure must match exactly)
                // Create result with custom property name for data
                var resultDict = new Dictionary<string, object>
                {
                    ["Result"] = new Dictionary<string, object>
                    {
                        ["Status"] = "Success",
                        ["RowCount"] = queryResult["RowCount"],
                        ["ColumnCount"] = queryResult["ColumnCount"],
                        ["Columns"] = queryResult["Columns"],
                        ["Rows"] = queryResult["Rows"],
                        ["SessionId"] = sessionId
                    },
                    ["Performance"] = timings.Performance,
                    ["EventDetails"] = timings.EventDetails
                };

                return SystemJsonSerializer.Serialize(resultDict, new SystemJsonSerializerOptions { WriteIndented = true });
        }

        private static void SetupTraceEvents(Trace trace, AdomdConnection queryConnection)
        {
            Log.Information("Setting up trace events using DAX Studio's approach...");

            // Get supported event/column combinations like DAX Studio does
            var supportedEventColumns = GetSupportedTraceEventClasses(queryConnection);

            // DAX Studio's desired columns (copied from TraceEventFactory.cs)
            var desiredColumns = new List<TraceColumn>
            {
                TraceColumn.ActivityID,
                TraceColumn.ApplicationName,
                TraceColumn.CpuTime,
                TraceColumn.CurrentTime,
                TraceColumn.DatabaseName,
                TraceColumn.Duration,
                TraceColumn.EndTime,
                TraceColumn.Error,
                TraceColumn.EventClass,
                TraceColumn.EventSubclass,
                TraceColumn.IntegerData,
                TraceColumn.NTUserName,
                TraceColumn.ObjectPath,
                TraceColumn.ObjectName,
                TraceColumn.ObjectReference,
                TraceColumn.RequestID,
                TraceColumn.RequestParameters,
                TraceColumn.RequestProperties,
                TraceColumn.SessionID,
                TraceColumn.StartTime,
                TraceColumn.TextData
            };

            // Add heartbeat events first (always added in DAX Studio)
            trace.Events.Clear();
            
            // DAX Studio always adds these events for the heartbeat mechanism
            var heartbeatEvents = new[]
            {
                TraceEventClass.DiscoverBegin,
                TraceEventClass.CommandBegin,
                TraceEventClass.QueryEnd
            };

            foreach (var eventClass in heartbeatEvents)
            {
                if (supportedEventColumns.ContainsKey((int)eventClass))
                {
                    var traceEvent = new Microsoft.AnalysisServices.TraceEvent(eventClass);
                    var supportedColumns = supportedEventColumns[(int)eventClass];

                    foreach (var column in desiredColumns)
                    {
                        if (supportedColumns.Contains((int)column))
                        {
                            traceEvent.Columns.Add(column);
                        }
                    }
                    
                    trace.Events.Add(traceEvent);
                    Log.Information("Added heartbeat event: {EventClass} with {ColumnCount} columns", eventClass, traceEvent.Columns.Count);
                }
            }

            // Add the main trace events for performance analysis (matching DAX Studio exactly)
            var eventsToAdd = new[]
            {
                TraceEventClass.QueryBegin,
                TraceEventClass.VertiPaqSEQueryBegin,
                TraceEventClass.VertiPaqSEQueryEnd,
                TraceEventClass.VertiPaqSEQueryCacheMatch,
                TraceEventClass.DirectQueryEnd,
                TraceEventClass.ExecutionMetrics,
                TraceEventClass.AggregateTableRewriteQuery
            };

            foreach (var eventClass in eventsToAdd)
            {
                if (supportedEventColumns.ContainsKey((int)eventClass))
                {
                    var traceEvent = new Microsoft.AnalysisServices.TraceEvent(eventClass);
                    var supportedColumns = supportedEventColumns[(int)eventClass];

                    foreach (var col in desiredColumns)
                    {
                        if (supportedColumns.Contains((int)col))
                        {
                            traceEvent.Columns.Add(col);
                        }
                    }
                    
                    trace.Events.Add(traceEvent);
                    Log.Debug("Added event {EventClass} with {ColumnCount} columns", eventClass, traceEvent.Columns.Count);
                }
                else
                {
                    Log.Warning("Event class {EventClass} not supported by server", eventClass);
                }
            }

            Log.Information("Trace events configured successfully using DAX Studio approach");
            
            // CRITICAL: Update the trace definition on the server like DAX Studio does
            trace.Update();
            Log.Information("Trace definition updated on server");
        }

        private static Dictionary<int, HashSet<int>> GetSupportedTraceEventClasses(AdomdConnection connection)
        {
            var result = new Dictionary<int, HashSet<int>>();

            try
            {
                using var command = new AdomdCommand("SELECT * FROM $SYSTEM.DISCOVER_TRACE_EVENT_CATEGORIES", connection);
                using var reader = command.ExecuteReader();

                while (reader.Read())
                {
                    var xml = reader.GetString(0);
                    using var xmlReader = new XmlTextReader(new StringReader(xml));
                    var xPathDoc = new XPathDocument(xmlReader);
                    var nav = xPathDoc.CreateNavigator();
                    var eventIter = nav.Select("/EVENTCATEGORY/EVENTLIST/EVENT/ID");

                    while (eventIter.MoveNext())
                    {
                        var eventId = eventIter.Current?.ValueAsInt ?? 0;
                        var columns = new HashSet<int>();
                        var columnIter = eventIter.Current?.Select("../EVENTCOLUMNLIST/EVENTCOLUMN/ID");

                        if (columnIter != null)
                        {
                            while (columnIter.MoveNext())
                            {
                                columns.Add(columnIter.Current?.ValueAsInt ?? 0);
                            }
                        }

                        result[eventId] = columns;
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to get supported trace event classes, using fallback");
                // Fallback to basic events if discovery fails
                result = GetFallbackEventColumns();
            }

            return result;
        }

        private static Dictionary<int, HashSet<int>> GetFallbackEventColumns()
        {
            // Fallback with safe, commonly supported columns
            return new Dictionary<int, HashSet<int>>
            {
                [(int)TraceEventClass.QueryBegin] = new HashSet<int> { 0, 15, 8, 1 }, // EventClass, StartTime, Duration, TextData
                [(int)TraceEventClass.QueryEnd] = new HashSet<int> { 0, 15, 8, 1, 16 }, // + CpuTime
                [(int)TraceEventClass.VertiPaqSEQueryEnd] = new HashSet<int> { 0, 15, 8, 1 }
            };
        }

        private static XmlNode GetSessionIdFilter(string sessionId, string applicationName)
        {
            // Simplified filter using only SessionID and ApplicationName (more universally supported)
            string filterTemplate =
                "<Or xmlns=\"http://schemas.microsoft.com/analysisservices/2003/engine\">" +
                    "<Equal><ColumnID>{0}</ColumnID><Value>{1}</Value></Equal>" +
                    "<Equal><ColumnID>{2}</ColumnID><Value>{3}</Value></Equal>" +
                "</Or>";
            
            var filterXml = string.Format(
                filterTemplate,
                (int)TraceColumn.SessionID,
                sessionId,
                (int)TraceColumn.ApplicationName,
                applicationName
            );
            
            var doc = new XmlDocument();
            doc.LoadXml(filterXml);
            return doc;
        }

        private static async Task ClearDatasetCache(AdomdConnection connection, Server server, string datasetName)
        {
            try
            {
                Log.Information("Clearing VertiPaq cache for dataset: {DatasetName}", datasetName);
                
                // Use the exact same XMLA command that DAX Studio uses (from ADOTabularDatabase.cs)
                var database = server.Databases.FindByName(datasetName);
                if (database != null)
                {
                    var databaseId = !string.IsNullOrEmpty(database.ID) ? database.ID : database.Name;
                    
                    await Task.Run(() => {
                        var clearCacheXmla = string.Format(System.Globalization.CultureInfo.InvariantCulture, @"
                <Batch xmlns=""http://schemas.microsoft.com/analysisservices/2003/engine"">
                   <ClearCache>
                     <Object>
                       <DatabaseID>{0}</DatabaseID>   
                    </Object>
                   </ClearCache>
                 </Batch>", databaseId);
                        
                        // Execute using ADOMD connection like DAX Studio does
                        using var command = connection.CreateCommand();
                        command.CommandType = CommandType.Text;
                        command.CommandText = clearCacheXmla;
                        command.ExecuteNonQuery();
                    });
                    Log.Information("VertiPaq cache cleared successfully for dataset: {DatasetName}", datasetName);
                }
                else
                {
                    Log.Warning("Database {DatasetName} not found on server for cache clearing", datasetName);
                }
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to clear VertiPaq cache for dataset {DatasetName}: {ErrorMessage}", datasetName, ex.Message);
                // Don't fail the trace if cache clearing fails - this is not critical
            }
        }

        private static Dictionary<string, string> GetColumnIdToNameMapping(AdomdConnection connection)
        {
            var mapping = new Dictionary<string, string>();
            
            try
            {
                const string query = "SELECT COLUMN_ID AS COLUMN_ID, ATTRIBUTE_NAME AS COLUMN_NAME FROM $SYSTEM.DISCOVER_STORAGE_TABLE_COLUMNS WHERE COLUMN_TYPE = 'BASIC_DATA'";
                
                using var command = new AdomdCommand(query, connection);
                using var reader = command.ExecuteReader();
                
                while (reader.Read())
                {
                    var columnId = reader.GetString(0);
                    var columnName = reader.GetString(1);
                    
                    // PowerPivot does not include the table id in the columnid so if two 
                    // tables have a column with the same name this can throw a duplicate key error
                    if (!mapping.ContainsKey(columnId))
                    {
                        mapping.Add(columnId, columnName);
                    }
                }
                
                Log.Debug("Retrieved {Count} column ID to name mappings", mapping.Count);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to retrieve column ID to name mappings");
            }
            
            return mapping;
        }

        private static Dictionary<string, string> GetTableIdToNameMapping(AdomdConnection connection)
        {
            var mapping = new Dictionary<string, string>();
            
            try
            {
                const string query = "SELECT TABLE_ID AS TABLE_ID, DIMENSION_NAME AS TABLE_NAME FROM $SYSTEM.DISCOVER_STORAGE_TABLES WHERE RIGHT(LEFT(TABLE_ID, 2), 1) <> '$'";
                
                using var command = new AdomdCommand(query, connection);
                using var reader = command.ExecuteReader();
                
                while (reader.Read())
                {
                    var tableId = reader.GetString(0);
                    var tableName = reader.GetString(1);
                    
                    // Safety check - if two tables have the same name
                    // this can throw a duplicate key error
                    if (!mapping.ContainsKey(tableId))
                    {
                        mapping.Add(tableId, tableName);
                    }
                }
                
                Log.Debug("Retrieved {Count} table ID to name mappings", mapping.Count);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to retrieve table ID to name mappings");
            }
            
            return mapping;
        }

        private static void PingTraceConnection(AdomdConnection connection)
        {
            try
            {
                // Execute DISCOVER_SESSIONS to trigger DiscoverBegin events (DAX Studio approach)
                Log.Information("Pinging trace connection with DISCOVER_SESSIONS...");
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = "SELECT * FROM $SYSTEM.DISCOVER_SESSIONS WHERE SESSION_ID = '" + connection.SessionID + "'";
                    using (var reader = command.ExecuteReader())
                    {
                        // Just consume the results to trigger the trace event
                        while (reader.Read()) { }
                    }
                }
                Log.Information("Ping completed successfully");
            }
            catch (Exception ex)
            {
                Log.Warning("Ping failed: {Error}", ex.Message);
            }
        }


    }

    // Enhanced trace event class that matches DAX Studio's event structure
    public class TraceEvent
    {
        public string? EventClass { get; set; }
        public string? EventSubclass { get; set; }
        public DateTime? StartTime { get; set; }
        public DateTime? EndTime { get; set; }
        public long? Duration { get; set; }
        public long? CpuTime { get; set; }
        public string? TextData { get; set; }
        public string? DatabaseName { get; set; }
        public string? SessionId { get; set; }
        public string? ApplicationName { get; set; }
        public string? ObjectName { get; set; }
        public string? ActivityId { get; set; }
        public bool InternalBatchEvent { get; set; }
        public long? NetParallelDuration { get; set; }
    }

    // Helper class to match DAX Studio's Server Timings calculation and output exactly
    public static class DaxStudioServerTimings
    {
        public class PerfMetrics
        {
            public string QueryEnd { get; set; } = "";
            public double Total { get; set; }
            public double FE { get; set; }
            public double SE { get; set; }
            public double SE_CPU { get; set; }
            public double SE_Par { get; set; }
            public int SE_Queries { get; set; }
            public int SE_Cache { get; set; }
        }

        public class EventDetail
        {
            public int Line { get; set; }
            public string Class { get; set; } = "";
            public string Subclass { get; set; } = "";
            public double Duration { get; set; }
            public double CPU { get; set; }
            public double Par { get; set; }
            public long Rows { get; set; }
            public long KB { get; set; }
            public string Query { get; set; } = "";
            // Timeline data for waterfall visualization
            public TimelineData? Timeline { get; set; }
        }

        public class TimelineData
        {
            public DateTime StartTime { get; set; }
            public DateTime EndTime { get; set; }
            public double StartOffset { get; set; } // Milliseconds from query start
            public double EndOffset { get; set; }   // Milliseconds from query start
            public double RelativeStart { get; set; } // Percentage of total duration
            public double RelativeEnd { get; set; }   // Percentage of total duration
        }

        public class TimingsResult
        {
            public PerfMetrics Performance { get; set; } = new PerfMetrics();
            public List<EventDetail> EventDetails { get; set; } = new List<EventDetail>();
        }

        public static TimingsResult Calculate(List<TraceEvent> events, DateTime queryStart, DateTime queryEnd, Dictionary<string, string> columnIdToNameMap, Dictionary<string, string> tableIdToNameMap)
        {
            var timings = new TimingsResult();
            if (!events.Any()) return timings;

            // Sort events by StartTime
            var sorted = events.OrderBy(e => e.StartTime ?? DateTime.MinValue).ToList();

            // Filter to only END events that DAX Studio processes (matching ServerTimesViewModel.cs logic)
            var endEvents = sorted.Where(e => 
                e.EventClass == "QueryBegin" ||  // Need QueryBegin for proper start time
                e.EventClass == "QueryEnd" ||
                e.EventClass == "VertiPaqSEQueryEnd" ||
                e.EventClass == "DirectQueryEnd" ||
                e.EventClass == "VertiPaqSEQueryCacheMatch" ||
                e.EventClass == "ExecutionMetrics").ToList();

            // Calculate metrics exactly like DAX Studio does
            var queryBeginEvent = endEvents.FirstOrDefault(e => e.EventClass == "QueryBegin");
            var queryEndEvent = endEvents.LastOrDefault(e => e.EventClass == "QueryEnd");
            
            // Total duration like DAX Studio: QueryEnd.CurrentTime - QueryBegin.StartTime
            double totalMs = 0;
            if (queryBeginEvent != null && queryEndEvent != null && queryEndEvent.EndTime.HasValue && queryBeginEvent.StartTime.HasValue)
            {
                totalMs = (queryEndEvent.EndTime.Value - queryBeginEvent.StartTime.Value).TotalMilliseconds;
            }
            else if (queryEndEvent != null)
            {
                // Fallback to QueryEnd duration if no QueryBegin
                totalMs = queryEndEvent.Duration ?? (queryEnd - queryStart).TotalMilliseconds;
            }
            else
            {
                // Final fallback
                totalMs = (queryEnd - queryStart).TotalMilliseconds;
            }
            
            // SE Events: Only VertiPaqSEQueryEnd and DirectQueryEnd, but exclude Internal events like DAX Studio
            var seEvents = endEvents.Where(e => 
                (e.EventClass == "VertiPaqSEQueryEnd" && e.EventSubclass != "VertiPaqScanInternal") || 
                e.EventClass == "DirectQueryEnd").ToList();

            // Debug: Log SE events to understand what we're counting
            Log.Information("SE Events found: {Count}", seEvents.Count);
            foreach (var se in seEvents)
            {
                Log.Information("SE Event: {EventClass}.{EventSubclass} - Duration: {Duration}ms, CPU: {CPU}ms", 
                    se.EventClass, se.EventSubclass ?? "NULL", se.Duration ?? 0, se.CpuTime ?? 0);
            }

            // Calculate SE metrics using DAX Studio's logic (StorageEngineQueryCount includes all scan subclasses)
            int seQueries = seEvents.Count(e => 
                e.EventClass == "VertiPaqSEQueryEnd" || 
                e.EventClass == "DirectQueryEnd"); // Count actual SE queries (including scans)
            int seCache = endEvents.Count(e => e.EventClass == "VertiPaqSEQueryCacheMatch");
            
            // Debug: Log cache events found
            var cacheEvents = endEvents.Where(e => e.EventClass == "VertiPaqSEQueryCacheMatch").ToList();
            Log.Information("Cache Events found: {Count}", cacheEvents.Count);
            foreach (var cache in cacheEvents)
            {
                Log.Information("Cache Event: {EventClass}.{EventSubclass}", cache.EventClass, cache.EventSubclass ?? "NULL");
            }
            
            Log.Information("seCache value being set to: {SeCacheValue}", seCache);
            double seTotalDuration = seEvents.Sum(e => e.Duration ?? 0);
            double seCpu = seEvents.Sum(e => e.CpuTime ?? 0);

            // Calculate net parallel duration using sweep-line algorithm (like DAX Studio)
            double seNetParallelMs = CalculateNetParallelDuration(seEvents);
            
            // FE = Total - SE Net Parallel (DAX Studio's calculation)
            double feMs = Math.Max(0, totalMs - seNetParallelMs);
            
            // SE CPU Factor = SE CPU / SE Net Parallel (DAX Studio's calculation)
            double seCpuFactor = seNetParallelMs > 0 ? seCpu / seNetParallelMs : 0;

            timings.Performance = new PerfMetrics
            {
                QueryEnd = queryEndEvent?.EndTime?.ToString("yyyy-MM-dd HH:mm:ss") ?? "",
                Total = Math.Round(totalMs, 0),
                FE = Math.Round(feMs, 0),
                SE = Math.Round(seNetParallelMs, 0),
                SE_CPU = Math.Round(seCpu, 0),
                SE_Par = Math.Round(seCpuFactor, 1),
                SE_Queries = seQueries,
                SE_Cache = seCache
            };

            // Build event details - Filter like DAX Studio (exclude QueryEnd and Internal events)
            // Include only: Scan events and ExecutionMetrics (matching your screenshot)
            var displayEvents = endEvents.Where(e => 
                (e.EventClass == "VertiPaqSEQueryEnd" && GetDisplaySubclass(e) == "Scan") ||
                e.EventClass == "ExecutionMetrics"
            ).OrderBy(e => e.StartTime ?? queryStart).ToList();
            
            // Calculate timeline data for waterfall visualization
            var actualQueryStartTime = queryEndEvent?.StartTime ?? queryStart;
            var queryTotalDuration = totalMs;
            
            // Create a comprehensive timeline including FE periods (yellow bars in DAX Studio)
            var timelineEvents = new List<EventDetail>();
            var currentTime = actualQueryStartTime;
            int line = 1;
            
            foreach (var e in displayEvents)
            {
                var eventStart = e.StartTime ?? actualQueryStartTime;
                var eventEnd = e.EndTime ?? eventStart.AddMilliseconds(e.Duration ?? 0);
                
                // Add FE period before this SE event (if there's a gap)
                if (eventStart > currentTime)
                {
                    var feStartOffset = (currentTime - actualQueryStartTime).TotalMilliseconds;
                    var feEndOffset = (eventStart - actualQueryStartTime).TotalMilliseconds;
                    var feDuration = feEndOffset - feStartOffset;
                    
                    if (feDuration > 1) // Only add FE periods > 1ms
                    {
                        var feEvent = new EventDetail
                        {
                            Line = line++,
                            Class = "FE",
                            Subclass = "Formula Engine",
                            Duration = Math.Round(feDuration, 0),
                            CPU = 0, // FE CPU not tracked separately
                            Par = 1.0,
                            Rows = 0,
                            KB = 0,
                            Query = "Formula Engine processing",
                            Timeline = new TimelineData
                            {
                                StartTime = currentTime,
                                EndTime = eventStart,
                                StartOffset = Math.Round(feStartOffset, 1),
                                EndOffset = Math.Round(feEndOffset, 1),
                                RelativeStart = queryTotalDuration > 0 ? Math.Round(feStartOffset / queryTotalDuration * 100, 1) : 0,
                                RelativeEnd = queryTotalDuration > 0 ? Math.Round(feEndOffset / queryTotalDuration * 100, 1) : 0
                            }
                        };
                        timelineEvents.Add(feEvent);
                    }
                }
                
                // Add the SE event
                var startOffset = (eventStart - actualQueryStartTime).TotalMilliseconds;
                var endOffset = (eventEnd - actualQueryStartTime).TotalMilliseconds;
                
                var detail = new EventDetail
                {
                    Line = line++,
                    Class = GetDisplayClass(e.EventClass),
                    Subclass = GetDisplaySubclass(e),
                    Duration = Math.Round((double)(e.Duration ?? 0), 0),
                    CPU = Math.Round((double)(e.CpuTime ?? 0), 0),
                    Par = CalculateParallelism(e),
                    Rows = ParseEstimatedRows(e.TextData),
                    KB = ParseEstimatedKB(e.TextData),
                    Query = FormatQueryText(e.TextData, e.EventClass, columnIdToNameMap, tableIdToNameMap),
                    Timeline = new TimelineData
                    {
                        StartTime = eventStart,
                        EndTime = eventEnd,
                        StartOffset = Math.Round(startOffset, 1),
                        EndOffset = Math.Round(endOffset, 1),
                        RelativeStart = queryTotalDuration > 0 ? Math.Round(startOffset / queryTotalDuration * 100, 1) : 0,
                        RelativeEnd = queryTotalDuration > 0 ? Math.Round(endOffset / queryTotalDuration * 100, 1) : 0
                    }
                };
                timelineEvents.Add(detail);
                currentTime = eventEnd;
            }
            
            // Add final FE period after last SE event (if any)
            var queryEndTime = actualQueryStartTime.AddMilliseconds(queryTotalDuration);
            if (currentTime < queryEndTime)
            {
                var feStartOffset = (currentTime - actualQueryStartTime).TotalMilliseconds;
                var feEndOffset = queryTotalDuration;
                var feDuration = feEndOffset - feStartOffset;
                
                if (feDuration > 1) // Only add FE periods > 1ms
                {
                    var feEvent = new EventDetail
                    {
                        Line = line++,
                        Class = "FE",
                        Subclass = "Formula Engine",
                        Duration = Math.Round(feDuration, 0),
                        CPU = 0,
                        Par = 1.0,
                        Rows = 0,
                        KB = 0,
                        Query = "Formula Engine processing",
                        Timeline = new TimelineData
                        {
                            StartTime = currentTime,
                            EndTime = queryEndTime,
                            StartOffset = Math.Round(feStartOffset, 1),
                            EndOffset = Math.Round(feEndOffset, 1),
                            RelativeStart = queryTotalDuration > 0 ? Math.Round(feStartOffset / queryTotalDuration * 100, 1) : 0,
                            RelativeEnd = queryTotalDuration > 0 ? Math.Round(feEndOffset / queryTotalDuration * 100, 1) : 0
                        }
                    };
                    timelineEvents.Add(feEvent);
                }
            }
            
            timings.EventDetails = timelineEvents;

            return timings;
        }

        private static double CalculateNetParallelDuration(List<TraceEvent> seEvents)
        {
            if (!seEvents.Any()) return 0;

            // Create intervals for each SE event
            var intervals = seEvents.Select(e => new
            {
                Start = e.StartTime ?? DateTime.MinValue,
                End = e.EndTime ?? (e.StartTime?.AddMilliseconds(e.Duration ?? 0) ?? DateTime.MinValue)
            }).OrderBy(i => i.Start).ToList();

            // Merge overlapping intervals (sweep-line algorithm)
            double totalMs = 0;
            DateTime currentEnd = DateTime.MinValue;

            foreach (var interval in intervals)
            {
                if (interval.Start > currentEnd)
                {
                    // No overlap, add full duration
                    totalMs += (interval.End - interval.Start).TotalMilliseconds;
                    currentEnd = interval.End;
                }
                else if (interval.End > currentEnd)
                {
                    // Partial overlap, add only non-overlapping part
                    totalMs += (interval.End - currentEnd).TotalMilliseconds;
                    currentEnd = interval.End;
                }
                // Full overlap: add nothing
            }

            return totalMs;
        }

        private static string GetDisplayClass(string? eventClass)
        {
            return eventClass switch
            {
                "VertiPaqSEQueryEnd" => "SE",
                "DirectQueryEnd" => "DirectQuery", 
                "QueryEnd" => "QueryEnd",
                "VertiPaqSEQueryCacheMatch" => "Cache",
                "ExecutionMetrics" => "ExecutionMetrics",
                _ => eventClass ?? ""
            };
        }

        private static string GetDisplaySubclass(TraceEvent e)
        {
            // Map event subclasses like DAX Studio does
            if (e.EventSubclass != null)
            {
                return e.EventSubclass switch
                {
                    "VertiPaqScan" => "Scan",
                    "BatchVertiPaqScan" => "Batch",
                    "VertiPaqScanInternal" => "Internal",
                    "VertiPaqCacheExactMatch" => "Cache",
                    _ => e.EventSubclass
                };
            }

            // Fallback based on EventClass
            return e.EventClass switch
            {
                "VertiPaqSEQueryEnd" => "Scan",
                "DirectQueryEnd" => "DirectQuery",
                "VertiPaqSEQueryCacheMatch" => "Cache",
                "ExecutionMetrics" => "ExecutionMetrics",
                _ => ""
            };
        }

        private static double CalculateParallelism(TraceEvent e)
        {
            // Calculate parallelism like DAX Studio individual events: CPU Time / Duration (not NetParallel)
            if ((e.Duration ?? 0) > 0 && (e.CpuTime ?? 0) > 0)
            {
                return Math.Round((double)(e.CpuTime ?? 0) / (double)(e.Duration ?? 1), 1);
            }
            return 1.0;
        }

        private static readonly Regex EstimatedSizeRegex = new Regex(@"Estimated size[^:]*:\s*(\d+),\s*(\d+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex EstimatedRowsRegex = new Regex(@"rows\s*=\s*(\d+(?:,\d+)*)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex EstimatedBytesRegex = new Regex(@"bytes\s*=\s*(\d+(?:,\d+)*)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static long ParseEstimatedRows(string? text)
        {
            if (string.IsNullOrEmpty(text)) return 0;
            
            // Try DAX Studio's pattern first: "Estimated size (volume, marshalling bytes): 12, 192"
            var sizeMatch = EstimatedSizeRegex.Match(text);
            if (sizeMatch.Success && long.TryParse(sizeMatch.Groups[1].Value, out var sizeRows))
            {
                return sizeRows;
            }
            
            // Fallback to old pattern
            var match = EstimatedRowsRegex.Match(text);
            if (match.Success && long.TryParse(match.Groups[1].Value.Replace(",", ""), out var rows))
            {
                return rows;
            }
            return 0;
        }

        private static long ParseEstimatedKB(string? text)
        {
            if (string.IsNullOrEmpty(text)) return 0;
            
            // Try DAX Studio's pattern first: "Estimated size (volume, marshalling bytes): 12, 192"
            var sizeMatch = EstimatedSizeRegex.Match(text);
            if (sizeMatch.Success && long.TryParse(sizeMatch.Groups[2].Value, out var sizeBytes))
            {
                return Math.Max(1, sizeBytes / 1024); // Convert to KB, minimum 1
            }
            
            // Fallback to old pattern
            var match = EstimatedBytesRegex.Match(text);
            if (match.Success && long.TryParse(match.Groups[1].Value.Replace(",", ""), out var bytes))
            {
                return Math.Max(1, bytes / 1024); // Convert to KB, minimum 1
            }
            return 0;
        }

        private static string FormatQueryText(string? textData, string? eventClass, Dictionary<string, string> columnIdToNameMap, Dictionary<string, string> tableIdToNameMap)
        {
            if (string.IsNullOrEmpty(textData)) return "";

            // For ExecutionMetrics, return JSON directly
            if (eventClass == "ExecutionMetrics") return textData;

            // For xmSQL queries (VertiPaqSEQueryEnd), clean the IDs to proper names
            if (eventClass == "VertiPaqSEQueryEnd")
            {
                textData = CleanXmSqlQuery(textData, columnIdToNameMap, tableIdToNameMap);
            }

            // For other events, just clean up formatting but don't truncate
            var cleaned = textData.Replace("\r\n", " ").Replace("\n", " ").Replace("\t", " ");
            
            // Remove multiple spaces
            while (cleaned.Contains("  "))
                cleaned = cleaned.Replace("  ", " ");

            return cleaned.Trim();
        }

        private static string CleanXmSqlQuery(string xmSqlQuery, Dictionary<string, string> columnIdToNameMap, Dictionary<string, string> tableIdToNameMap)
        {
            // Replace column IDs with column names
            foreach (var kvp in columnIdToNameMap)
            {
                if (xmSqlQuery.Contains(kvp.Key))
                {
                    xmSqlQuery = xmSqlQuery.Replace(kvp.Key, kvp.Value);
                }
            }
            
            // Replace table IDs with table names
            foreach (var kvp in tableIdToNameMap)
            {
                if (xmSqlQuery.Contains(kvp.Key))
                {
                    xmSqlQuery = xmSqlQuery.Replace(kvp.Key, kvp.Value);
                }
            }
            
            // Apply DAX Studio's xmSQL simplification steps
            xmSqlQuery = RemoveXmSqlAliases(xmSqlQuery);
            xmSqlQuery = RemoveXmSqlSquareBrackets(xmSqlQuery);
            
            return xmSqlQuery;
        }

        private static readonly Regex XmSqlAliasRemoval = new Regex(@" AS\s*\[[^\]]*\]", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex XmSqlSquareBracketsWithSpace = new Regex(@"(?<![\.0-9a-zA-Z'])\[([^\[])*\]", RegexOptions.Compiled);
        private static readonly Regex XmSqlDotSeparator = new Regex(@"\.\[", RegexOptions.Compiled);

        private static string RemoveXmSqlAliases(string xmSqlQuery)
        {
            // Remove " AS [alias]" patterns
            return XmSqlAliasRemoval.Replace(xmSqlQuery, "");
        }

        private static string RemoveXmSqlSquareBrackets(string xmSqlQuery)
        {
            // Replace [Table].[Column] with 'Table'[Column]
            // First, replace patterns like [Table] (not preceded by dot) with 'Table'
            xmSqlQuery = XmSqlSquareBracketsWithSpace.Replace(xmSqlQuery, m =>
            {
                var content = m.Value.Trim('[', ']');
                return $"'{content}'";
            });
            
            // Then replace .[ with [  (so 'Table'.[Column] becomes 'Table'[Column])
            xmSqlQuery = XmSqlDotSeparator.Replace(xmSqlQuery, "[");
            
            return xmSqlQuery;
        }
    }
}
