
### Fabric Monitoring

Assets in this folder are meant to enhance your monitoring experience with Fabric.


#### How to find the right asset for your purpose?

There are different diagnostic/monitoring tools out there. Here is a (not exhausted) list to map different monitoring tools within the Fabric toolbox:


|Solution|Meta data | Activity logs | Engine trace logs | CU metrics |Engine meta data|Platform level|
|--|--|--|--|--|--|--|
|**Fabric Unified Admin Monitoring (FUAM)** |✅|✅| ◐ (for topN semantic models only)|✅|◐ (partly - with engine specific reports)|**primary tenant** level -> capacity -> domain -> workspace -> item/engine level|
|**Workspace Monitoring Report templates**|◐ (partly, extracted from trace logs)|❌|✅|◐ (raw CPU & memory)|◐ (partly, extracted from trace logs)|**workspace** level (one per connection) -> **item/engine** level (for supported items)|
|**Semantic Model Audit**|◐ (partly, extracted from trace logs)|❌|✅|◐ (raw CPU & memory|✅|**workspace** level (one per connection) -> **item/engine** level (for semantic models)|
|**Engine specific reports within FUAM**|❌|❌|❌|❌|✅|**item** level for semantic models/SQL endpoints (one per connection)|
