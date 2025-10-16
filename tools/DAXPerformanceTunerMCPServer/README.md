# DAX Performance Tuner

Transform slow DAX queries into lightning-fast optimized code using AI assistance and expert knowledge.

## ⚡ Quick Setup

### **Prerequisites**

Before you begin, install:
- ✅ **Python 3.8+** - [Download here](https://python.org/downloads/)
  - Important: Check "Add Python to PATH" during installation
- ✅ **\.NET 8.0 Runtime** - [Download here](https://dotnet.microsoft.com/download/dotnet/8.0)
  - Choose ".NET 8.0 Runtime" (not SDK)

---

### **Installation Steps**

1. **Download the Repository**
   - Click the green "Code" button → "Download ZIP"
   - Extract to any folder on your computer

2. **Run Setup**
   - Navigate to `tools\DAXPerformanceTunerMCPServer\`
   - Double-click `setup.bat` (or run `setup.ps1` in PowerShell)
   
   The setup will:
   - ✅ Create a Python virtual environment
   - ✅ Install required Python packages
   - ✅ Generate MCP configuration for VS Code

3. **Configure Your AI Client**
   
   **For VS Code (GitHub Copilot/Claude):**
   - Restart VS Code - the `.vscode/mcp.json` config is already created
   - You'll see "DAX Performance Tuner" available in AI chat
   
   **For Claude Desktop:**
   - Add to your `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "dax-performance-tuner": {
         "command": "C:\\path\\to\\DAXPerformanceTunerMCPServer\\.venv\\Scripts\\python.exe",
         "args": ["src/server.py"]
       }
     }
   }
   ```
   
   **For Other MCP Clients:**
   - Command: `{install_path}\.venv\Scripts\python.exe`
   - Args: `["src/server.py"]`
   - Working Directory: `{install_path}`

---

## 🎉 Start Optimizing

Once configured, ask your AI: **"Help me optimize this DAX query"**


## 🛠️ Tools You Get

| Tool | What It Does |
|------|--------------|
| `connect_to_dataset` | **Smart connection tool** - Auto-discovers datasets, searches desktop instances, or connects directly based on what info you provide. Works with Power BI Service workspaces AND local Desktop instances. Call with no parameters to discover desktop instances (no auth). Add `location="service"` to discover workspaces instead. |
| `prepare_query_for_optimization` | Complete baseline setup: inline measures, execute baseline, get metadata & research |
| `execute_dax_query` | Test optimization attempts with automatic baseline comparison |
| `get_session_status` | Track your optimization progress, view session history, and get intelligent next step recommendations |

## 🚀 2-Stage Optimization Workflow

**Stage 1 - Connection**: Connect to your Power BI dataset  
**Stage 2 - Comprehensive Optimization**: Complete baseline analysis → Iterative optimization → Performance validation

**What Makes It Powerful:**
- **Research-Driven**: Automatically retrieves targeted optimization articles based on query patterns
- **Evidence-Based**: Deep performance trace analysis with Formula Engine vs Storage Engine breakdown
- **Workflow-Guided**: Systematic 2-stage process ensures comprehensive optimization
- **Iterative**: Multiple optimization rounds achieve compound performance improvements
- **Semantic Validation**: Guarantees optimized queries return identical results to baseline

**Quick Development Setup:**
```bash
pip install -r requirements.txt
python src/server.py
```

**What's Included:**
- Pre-built `DaxExecutor.exe` (no compilation needed)
- ADOMD.NET DLLs in `dotnet/` folder (for XMLA connectivity)
- Complete Python MCP server implementation

**Optional: Automated Setup (Windows):**
- `setup.bat` → launches the PowerShell helper
- `setup.ps1 -NonInteractive` → skip prompts (handy for CI or advanced users)

## Attribution & Credits

This project builds upon and references valuable DAX optimization knowledge from the community:

We are grateful for their contributions to the DAX community. See [ATTRIBUTION.md](ATTRIBUTION.md) for detailed third-party content attribution.

**Important**: This project uses dual licensing. See license section below for details.

## License

This project uses **dual licensing**:

### MIT License
Applies to:
- Python MCP server (`src/server.py`, `src/dax_performance_tuner/`)
- Configuration files
- Setup scripts
- Documentation (except third-party content)

### Microsoft Reciprocal License (Ms-RL)
Applies to:
- **C# DAX Executor component** (`src/dax_executor/`)
- This component contains code derived from [DAX Studio](https://github.com/DaxStudio/DaxStudio)
- See `src/dax_executor/LICENSE-MSRL.txt` for full license text

**What this means for users:**
- ✅ You can freely use, modify, and distribute this project
- ✅ Most of the project (Python components) is under permissive MIT license
- ⚠️ If you modify the C# executor component, you must share those changes under Ms-RL
- ℹ️ Ms-RL is an OSI-approved open source license that only requires reciprocal sharing of modifications to Ms-RL files

See `ATTRIBUTION.md` for complete third-party content attribution and licensing details.

---
