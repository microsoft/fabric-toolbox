# Visualizing Linked Table Dataflow Dependencies

When planning and executing a successful modernization, it's essential to have a comprehensive understanding of all the components involved. This includes recognizing how different dataflows are interconnected and how they span across various workspaces. Visualizing dependencies between Power BI dataflows that utilize linked tables simplifies the process of understanding upstream dataflows. 

# Notebook

- **[Visualizing linked table dataflows](./visualizing-linked-table-dataflows.ipynb):** This notebook creates a dependency map of all upstream dataflows and the workspaces they reside within.

# Instructions

1. To get started, you can specify the workspace you want to view dataflows within by customizing the labs.list_dataflows('workspace name') function in the third cell.
  - If left blank, it will default to the workspace of the current notebook.
2. In the fourth cell, update the `df_name` variable to the name of the dataflow you want to analyze.
  - You can also specify a different workspace by providing a second argument to the function ``labs.list_upstream_dataflows('dataflow name', 'workspace')``.
3. The final code block will display a dependency map, including the workspace and the dataflow title.

# Example

A visualized data lineage enhances your ability to manage and execute your dataflow modernization projects effectively.

Let's break down a dependency map:
1. The dataflow starts in a workspace called **Linked Table** with a dataflow named **Third Link**. Third Link is connected to two upstream dataflows:
- **New Link From One**, which is located in the workspace **Linked Table Example 1**.
- **2ndLink**, which is located in the workspace **Linked Table Example 2**.
2. Additionally, **2ndLink** is connected to another dataflow called **Gen1Dataflow**, which also resides in the workspace Linked **Table Example 1**.

The original dataflow spans across three workspaces and involves multiple connections between different dataflows.
![Dataflow dependency map](./media/dataflow_dependency.png)
