--All Queries that were executing at a given time
SELECT * FROM queryinsights.exec_requests_history
WHERE start_time <= '2023-12-11 21:15:52'
AND '2023-12-11 21:15:52' <= end_time

