# Reservation

🎬 Reservation setup demo available on YouTube : [Fabric Cost Analysis](https://youtu.be/ZRtxJgFGfi4)

# 1 - Configure reservation export

To create reservation export, on the Azure portal , search for **Cost Management**
- Select the required scope and select **Exports** in the left navigation menu
- Select **+ Create**
- On the Basics tab, select the template = **All reservation data**
- On the Datasets tab, fill in **Export prefix** with "fca"
- On the Destination tab, select:
  - Storage type = **Azure blob storage**
  - Destination and storage = **Use existing**
  - Subscription = Your subscription
  - Storage account = Your storage account
  - Container = **fca**
  - Directory = **reservation**
  - Format = **csv**
  - Compression type = **none**
  - Overwrite data = **Enabled**
- On the Review + Create tab, select **Create**
- Run the export by selecting **Run now** on the export page

>ℹ️ When performing the export, you have the option to retrieve one year of historical data in one-month chunks.

## 2 - Create Shortcut

- Create a new File Shortcut on the FCA Lakehouse ([Create an Azure Data Lake Storage Gen2 shortcut](https://learn.microsoft.com/en-us/fabric/onelake/create-adls-shortcut))
  - Select the ellipsis (**...**) next to **Files**
  - Select **New shortcut**
  - Select Azure Data Lake Storage Gen 2 and provide the following settings:
    - URL = **Data Lake Storage** URL of the Data Lake storage account. To get the Data Lake Storage URL, view the storage account where the export created a directory and the FOCUS cost file (If your're using **FinOps Hub**, use the existing storage account with the ingestion container). Under **Settings**, select **Endpoints**. Copy the URL marked as **Data Lake Storage** it should look like this: *https://###.dfs.core.windows.net*.
    - Connection = **Create a new connection**
    - Connection name = <*Any name of your choice*>
    - Authentication kind = **Organizational account**
    - Sign in when prompted
    - Select the Shortcut target sub path:
      -  For <u>Focus export configured previously</u>: **fca-focus-cost** and click on Next (⚠️ Ensure the selected hierarchy is correct)
      -  For <u>FinOps Hub</u>: **Costs** in the ingestion container and click on Next

![FCA](./media/Setup-Export3.png)

- Verify and rename if required the Shortcuts to **focuscost** and click on Create

![FCA](./media/Setup-Export4.png)

- Verify access to the data

## 3 - Enable activity in the Pipeline

- Open the **Load FCA E2E** Data pipeline
- Activate the **...** activity
- Run the Pipeline once

![Load FCA E2E Notebook](./media/Setup_NotebookExecution.png)

## 4 - Open the report

- Navigate to your FCA workspace
- Search for the item FCA_Core_Report
- Open the FCA_Core_Report Power BI report
- Open the Quota page and begin your analysis
