# DAX Performance Tuner

Transform slow DAX queries into lightning-fast optimized code using AI assistance and expert knowledge.

## ⚡ Quick Install (2 Steps)

### **Option 1: One-Click Install (Easiest)** 🚀

**Step 1: Download One File**
- **Right-click and "Save As"**: [install.bat](https://raw.githubusercontent.com/DAXNoobJustin/fabric-toolbox/Add-DAX-Performance-Tuner-MCP/tools/DAXPerformanceTunerMCPServer/install.bat)
- Save it anywhere on your computer (like your Desktop or Downloads folder)

**Step 2: Run It**
- Double-click `install.bat`
- It will automatically:
  - ✅ Download all required files from GitHub (~43 MB)
  - ✅ Create Python virtual environment
  - ✅ Install dependencies
  - ✅ Configure VS Code MCP settings
  - ✅ Verify DaxExecutor.exe and ADOMD.NET DLLs

**That's it!** 🎉

The tool will be installed to: `%LOCALAPPDATA%\DAXPerformanceTuner`

---

### **Option 2: PowerShell One-Liner** 💻

For power users, run this in PowerShell:
```powershell
irm https://raw.githubusercontent.com/DAXNoobJustin/fabric-toolbox/Add-DAX-Performance-Tuner-MCP/tools/DAXPerformanceTunerMCPServer/install.ps1 | iex
```

---

### **Option 3: Manual Download** 📦

If you prefer to download the repository:
1. Download this repository (green "Code" button → "Download ZIP")
2. Extract to a folder
3. Navigate to `tools\DAXPerformanceTunerMCPServer\`
4. Run `setup.bat`

---

## 📋 Prerequisites

Before running the installer, make sure you have:
- ✅ **Python 3.8+** - [Download here](https://python.org/downloads/)
  - Important: Check "Add Python to PATH" during installation
- ✅ **\.NET 8.0 Runtime** - [Download here](https://dotnet.microsoft.com/download/dotnet/8.0)
  - Choose ".NET 8.0 Runtime" (not SDK)
- ✅ **Internet connection** - For downloading dependencies

The installer will check for these and guide you if anything is missing.

---

## 🎉 What Happens After Installation?

The installer will:
1. ✅ Download the DAX Performance Tuner files
2. ✅ Create a Python virtual environment (`.venv`)
3. ✅ Install all required Python packages
4. ✅ Generate your MCP configuration file (`.vscode/mcp.json`)

**That's it!** The tool is ready to use with your AI client.

---

## 🔌 Using with Your AI Client

### **VS Code with GitHub Copilot** (Recommended)

The installer creates `.vscode/mcp.json` automatically - just restart VS Code and you'll see the DAX Performance Tuner available in your AI chat.

### **Claude Desktop**

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dax-performance-tuner": {
      "command": "C:\\Users\\YourUsername\\AppData\\Local\\DAXPerformanceTuner\\.venv\\Scripts\\python.exe",
      "args": ["src/server.py"]
    }
  }
}
```

Replace `YourUsername` with your Windows username. Restart Claude Desktop to activate.

### **Other MCP Clients**

Point your client to:
- **Command**: `{install_path}\.venv\Scripts\python.exe`
- **Args**: `["src/server.py"]`
- **Working Directory**: `{install_path}`

Default install path: `%LOCALAPPDATA%\DAXPerformanceTuner`


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
