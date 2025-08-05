@cls
@echo "This script sets up the Semantic Model MCP Server environment."

@echo "Step 1: Create virtual environment..."
python -m venv .venv

@echo "Step 2: Activating virtual environment..."
call .venv\Scripts\activate.bat

@echo "Step 3: Installing dependencies..."
pip install -r requirements.txt

@echo "Step 4: Opening the project in Visual Studio Code..."
code .