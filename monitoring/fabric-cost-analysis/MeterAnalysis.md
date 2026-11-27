# Meter Analysis

The **Meter Analysis** page (Operate phase) shows the consumption of the Fabric meters **day by day** and lets you isolate the **OnDemand meters** with one click. It helps to answer questions such as *which meters drive the cost of a period*, *when did an OnDemand meter start to be billed* or *how does a meter evolve from one day to the next*.

It uses the data FCA already loads (the FOCUS cost data and the `meters` table): there is **nothing to configure, no new pipeline and no new lakehouse table**.

## How to use the page

| Area | What it does |
| --- | --- |
| **View** (tiles) | **All Meters** (default) or **OnDemand Only**. Everything on the page (cards, charts, table, meter list) follows the selected view. |
| **Date**, **Subscription**, **Region, Capacity** | Same slicers as the other pages, they are synchronized with them. The Date slicer is the Power BI *Date picker*: relative periods (last, this or next days, weeks, months or years) and a calendar to select any date range. |
| **Category**, **Meters** | Page filters. The *Meters* list shows only the meters that have consumption in the selected period and view, and has a search box. Select several meters to compare them (Ctrl+click if your click replaces the selection). |
| **Cards** | Cost of the selected view, cost of the OnDemand meters, share of the OnDemand meters in the total cost, and number of meters with consumption. |
| **Status line** | Tells which view is selected and how many meters are shown. When nothing can be shown it says why (for example *No OnDemand meter consumption for the current filters*). |
| **Daily cost: standard vs OnDemand meters** | One column per day. OnDemand meters are stacked in purple, the other meters in green. |
| **Daily cost: top 10 meters of the selection** | One line per meter, for the 10 meters with the highest cost in the selection. Select meters in the *Meters* list (or a category) to compare the ones you need. |
| **Table** | One row per meter: type (purple **OnDemand** badge or green **Standard** badge), category, unit, quantity, cost, share of the view, number of days with consumption, average cost per day with consumption and the daily trend. Click a column header to sort. Click a row to filter the charts on this meter. |

Clicking a column or a line in a chart filters the other visuals, which lets you go from the trend of a period to the meters behind a given day.

## What is an OnDemand meter

The cost data does not flag OnDemand usage: the charge category, the pricing category and the charge frequency are the same for OnDemand and capacity usage. FCA therefore identifies the OnDemand meters from the `meters` table (see [data/Meters.csv](./data/Meters.csv)). A meter is an OnDemand meter when:

- its **category starts with `On-Demand`** (for example `On-Demand OneLake`, `On-Demand Data Warehouse`), or
- its **name ends with `OD On-Demand Usage CU`** (the naming of the OnDemand meters, for example *Power BI OD On-Demand Usage CU*).

The second rule is a fallback: the categories of existing installations are prefixed with `On-Demand` by the next run of the pipeline (`01_Load_Meters`), and until then the name rule gives the same result. The rule is defined once, in the hidden measure `Meter Is OnDemand` of the `meter_view` table.

## Semantic model

The page adds one table, `meter_view`, to the semantic model. It is a **calculated table without any relationship** (two rows, *All Meters* and *OnDemand Only*) that feeds the View tiles and hosts the measures of the page. It is not read from the lakehouse, so it does not need any data load.

| Measure | Description |
| --- | --- |
| `Meter Cost` | Cost of the meters of the selected view |
| `Meter Cost OnDemand` / `Meter Cost Standard` | Cost of the OnDemand meters / of the other meters. The `OnDemand Cost` measure of the `fca` table (Home page, *Additional Cost Details* table) uses the same calculation |
| `Meter OnDemand %` | Share of the OnDemand meters in the total cost |
| `Meter Count` | Number of meters with consumption in the selected view |
| `Meter Quantity`, `Meter Unit` | Consumed quantity of a meter and its unit (CU hours or GB per month) |
| `Meter Cost Detail`, `Meter Avg Daily Cost` | Cost of a meter and average cost per day with consumption, with 4 decimals (the cost of some OnDemand meters is a fraction of a cent) |
| `Meter Active Days` | Number of days with consumption of a meter |
| `Meter Share %` | Share of a meter in the cost of the selected view |
| `Meter Type` | OnDemand / Standard badge (image) used in the table |
| `Meter Status` | Text of the status line |
| `Meter Is OnDemand`, `Meter In View`, `Meter View Is OnDemand`, `Meter Count OnDemand` | Hidden helper measures |

The costs are the effective costs of the FCA model, so the cost of all meters adds up to the total cost shown on the other pages.

## Known limitations

- **OnDemand consumption exists only in some periods**. In a period without OnDemand usage the *OnDemand Only* view is empty and the status line says so: widen the date range or switch back to *All Meters*.
- **Quantities are not additive across meters**: the consumed quantity is expressed in CU hours for the capacity and OnDemand meters and in GB per month for the storage meters. The quantity is therefore shown per meter, with its unit, and the charts show cost.
- The line chart shows **at most 10 meters** (the 10 with the highest cost in the selection). To compare other meters, select them in the *Meters* list.
- Because the OnDemand meters are identified from the `meters` table, a new OnDemand meter published by Microsoft is recognized as soon as it follows the `On-Demand` category or the `OD On-Demand Usage CU` naming.

## Upgrade from a previous version

Nothing has to be loaded or configured. Run the `00_Deploy_FCA` notebook as usual: it updates the semantic model (new `meter_view` table and measures) and the report (new page). Existing data, tables and pages are not modified, and the other pages work exactly as before.

The new categories of the OnDemand meters (`On-Demand ...`) come with the next run of the **Load FCA E2E** pipeline (`01_Load_Meters`); the page works before and after this run.
