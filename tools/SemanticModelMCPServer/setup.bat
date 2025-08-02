@echo "This script sets up the Semantic Model MCP Server environment."
@echo "Step 1: Cloning the repository..."
git clone --branch Semantic-Model-MCP-Server https://github.com/philseamark/fabric-toolbox.git


@echo "Step 2: Navigating to the SemanticModelMCPServer directory..."
cd fabric-toolbox\tools\SemanticModelMCPServer

@echo "Step 3: Create virtual environment..."
python -m venv venv

@echo "Step 4: Activating virtual environment..."
call venv\Scripts\activate.bat

@echo "Step 5: Installing dependencies..."
pip install -r requirements.txt

@echo "Step 6: Opening the project in Visual Studio Code..."
code .