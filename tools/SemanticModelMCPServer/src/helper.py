# src/helper.py
# This file contains utility functions to assist with various tasks in the Semantic Model MCP Server.
# It includes functions to count nodes with a specific name in a JSON-like structure.
# This file is part of the Semantic Model MCP Server project.
def count_nodes_with_name(data, target_name):
    count = 0
    if isinstance(data, dict):
        for key, value in data.items():
            if key == target_name:
                count += 1
            count += count_nodes_with_name(value, target_name)
    elif isinstance(data, list):
        for item in data:
            count += count_nodes_with_name(item, target_name)
    return count