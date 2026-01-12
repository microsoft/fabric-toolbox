# Third-Party Content Attribution

This project references, links to, and builds upon valuable DAX optimization knowledge from various sources in the community.

## DAX Studio - Code Derivation (Ms-RL License)

The C# DAX Executor component (`src/dax_executor/`) contains code derived from DAX Studio:

- **Project**: DAX Studio
- **Repository**: https://github.com/DaxStudio/DaxStudio
- **Copyright**: Darren Gosbell and DAX Studio contributors
- **License**: Microsoft Reciprocal License (Ms-RL)
- **License File**: `src/dax_executor/LICENSE-MSRL.txt`

**Derived Components:**
- Trace event setup and collection patterns
- Server timings calculation algorithms (including net parallel duration calculation)
- xmSQL query formatting and cleaning with regex patterns
- DMV-based column/table ID mapping queries
- Event filtering and classification logic

We are deeply grateful to Darren Gosbell and the DAX Studio team for their excellent work
and for making their code available under an open source license. DAX Studio is an
indispensable tool for the DAX community, and this project builds upon their innovations
to provide a programmatic interface for DAX query optimization.

**Compliance**: All files containing DAX Studio-derived code are marked with appropriate
headers and are governed by the Ms-RL license as required.

## SQLBI Documentation

This project references and links to documentation from SQLBI.com:

- **VertiPaq xmSQL**: https://docs.sqlbi.com/dax-internals/vertipaq/xmSQL
- **Vertical Fusion**: https://docs.sqlbi.com/dax-internals/optimization-notes/vertical-fusion
- **Horizontal Fusion**: https://docs.sqlbi.com/dax-internals/optimization-notes/horizontal-fusion
- **SWITCH Optimization**: https://docs.sqlbi.com/dax-internals/optimization-notes/switch-optimization

Copyright © SQLBI. All rights reserved.

## Scope of This Project's License

The MIT License in this repository applies **only to the original code and tooling** created for this project, including:

- MCP server implementation (`src/server.py`)
- Connection and execution infrastructure
- Session management and workflow orchestration
- Custom optimization analysis code

The MIT License does **NOT** apply to third-party content referenced above, which remains the property of their respective copyright holders.

## Acknowledgments

We are deeply grateful to:

- **SQLBI** (Marco Russo, Alberto Ferrari, and team) for their invaluable contributions to DAX education and optimization knowledge
- The broader DAX community for continuous innovation and knowledge sharing

If you are a copyright holder and have concerns about how your content is referenced in this project, please contact us immediately so we can address your concerns.

## Fair Use Statement

This project references external content for educational and analytical purposes. We believe our use constitutes fair use under applicable copyright law, but we are actively seeking explicit permission from content owners to ensure full compliance.

Where external content is fetched or displayed:
- We provide clear attribution and links to original sources
- We do not claim ownership of third-party content
- We encourage users to visit original sources for comprehensive information
- We are committed to respecting intellectual property rights

## Contact

For questions about attribution or to report copyright concerns, please open an issue in this repository.
