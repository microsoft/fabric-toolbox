#!/usr/bin/env python
"""
Demo script showing complete CLI usage workflow.

This script demonstrates the typical workflow for migrating an ADF
ARM template to Microsoft Fabric using the CLI tool.
"""

import subprocess
import sys
from pathlib import Path

# ANSI color codes for output
GREEN = '\033[92m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'


def run_command(description: str, command: list, check: bool = True):
    """Run a command and display it."""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{GREEN}► {description}{RESET}")
    print(f"{YELLOW}Command: {' '.join(command)}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    try:
        result = subprocess.run(command, check=check, capture_output=False, text=True)
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"\n{YELLOW}⚠ Command failed with exit code {e.returncode}{RESET}")
        return False
    except Exception as e:
        print(f"\n{YELLOW}⚠ Error: {e}{RESET}")
        return False


def main():
    """Run the demo workflow."""
    print(f"{GREEN}")
    print("=" * 80)
    print("ADF to Fabric Migration CLI - Demo Workflow")
    print("=" * 80)
    print(f"{RESET}")
    
    # Check if we're in the right directory
    if not Path("cli_migrator.py").exists():
        print(f"{YELLOW}Error: Please run this from the FabricDataFactoryMigrationAssistant directory{RESET}")
        sys.exit(1)
    
    # Configuration (modify these for your environment)
    template_file = "adf_fabric_migrator/samples/sample_template.json"
    workspace_id = "your-workspace-id-here"  # Replace with actual workspace ID
    connection_config = "examples/connection_config_example.json"
    
    print(f"\n{BLUE}Configuration:{RESET}")
    print(f"  ARM Template: {template_file}")
    print(f"  Workspace ID: {workspace_id}")
    print(f"  Connection Config: {connection_config}")
    
    # Check if template exists
    if not Path(template_file).exists():
        print(f"\n{YELLOW}Note: Sample template not found at {template_file}{RESET}")
        print("Please provide your own ARM template path or create a sample.")
        template_file = input("Enter ARM template path: ").strip()
        if not Path(template_file).exists():
            print(f"{YELLOW}Error: Template not found{RESET}")
            sys.exit(1)
    
    input(f"\n{GREEN}Press Enter to start the demo workflow...{RESET}")
    
    # Step 1: Analyze the ARM template
    run_command(
        "Step 1: Analyze ARM Template",
        ["python", "cli_migrator.py", "analyze", template_file]
    )
    
    input(f"\n{GREEN}Press Enter to continue to profile generation...{RESET}")
    
    # Step 2: Generate migration profile
    profile_output = "migration_profile.json"
    run_command(
        "Step 2: Generate Migration Profile",
        ["python", "cli_migrator.py", "profile", template_file, "--output", profile_output]
    )
    
    if Path(profile_output).exists():
        print(f"\n{GREEN}✓ Profile saved to: {profile_output}{RESET}")
    
    input(f"\n{GREEN}Press Enter to continue to dry run migration...{RESET}")
    
    # Step 3: Dry run migration
    run_command(
        "Step 3: Migration Dry Run (Preview)",
        ["python", "cli_migrator.py", "migrate", template_file,
         "--workspace-id", workspace_id,
         "--dry-run"]
    )
    
    print(f"\n{YELLOW}{'='*80}{RESET}")
    print(f"{YELLOW}Dry run complete! Review the output above.{RESET}")
    print(f"{YELLOW}{'='*80}{RESET}")
    
    # Ask if user wants to proceed with actual migration
    proceed = input(f"\n{GREEN}Do you want to proceed with actual migration? (yes/no): {RESET}").strip().lower()
    
    if proceed == 'yes':
        # Step 4a: Create connections only
        run_command(
            "Step 4a: Create Fabric Connections",
            ["python", "cli_migrator.py", "migrate", template_file,
             "--workspace-id", workspace_id,
             "--connection-config", connection_config,
             "--skip-pipelines",
             "--skip-global-params"]
        )
        
        input(f"\n{GREEN}Press Enter to continue to pipeline deployment...{RESET}")
        
        # Step 4b: Deploy pipelines
        run_command(
            "Step 4b: Deploy Pipelines",
            ["python", "cli_migrator.py", "migrate", template_file,
             "--workspace-id", workspace_id,
             "--skip-connections"]
        )
        
        print(f"\n{GREEN}")
        print("=" * 80)
        print("Migration Complete!")
        print("=" * 80)
        print(f"{RESET}")
        print("Next steps:")
        print("1. Review created connections in Fabric workspace")
        print("2. Configure connection credentials")
        print("3. Test deployed pipelines")
        print("4. Update Workspace Identity permissions if needed")
    else:
        print(f"\n{YELLOW}Migration cancelled. You can run it later using:{RESET}")
        print(f"  python cli_migrator.py migrate {template_file} --workspace-id {workspace_id}")
    
    print(f"\n{GREEN}Demo workflow completed!{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{YELLOW}Demo interrupted by user{RESET}")
        sys.exit(0)
