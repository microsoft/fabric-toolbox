import argparse
import sys
from typing import List, Optional


class CLIRouter:
    """Routes CLI commands to appropriate handlers."""

    def __init__(self):
        # Import commands here to avoid circular imports
        from fabric_assessment_tool.commands.assess import AssessCommand

        # from fabric_assessment_tool.commands.export import ExportCommand
        # from fabric_assessment_tool.commands.extract import ExtractCommand

        self.commands = {
            "assess": AssessCommand(),
            # "extract": ExtractCommand(),
            # "export": ExportCommand(),
        }

    def run(self, args: List[str]) -> None:
        """Parse arguments and route to appropriate command."""
        if not args:
            self._print_help()
            return

        command_name = args[0]

        if command_name in ["-h", "--help"]:
            self._print_help()
            return

        if command_name in self.commands:
            command = self.commands[command_name]
            command.execute(args[1:])  # Pass remaining args to command
        else:
            print(f"Unknown command: {command_name}")
            self._print_help()
            sys.exit(1)

    def _print_help(self) -> None:
        """Print help message."""
        print("usage: lls [-h] assess")
        print()
        print("Fabric Assessment Tool - Migration Assessment Tool for Fabric DE/DW")
        print()
        print("positional arguments:")
        print("  {assess}")
        print("                        Command to execute")
        print()
        print("options:")
        print("  -h, --help            show this help message and exit")
        print()
        print("Examples:")
        print(
            "  lls assess --source synapse --mode full --ws workspace1,workspace2 -o output_dir/"
        )

    def _create_parser(self) -> argparse.ArgumentParser:
        """Create the main argument parser."""
        parser = argparse.ArgumentParser(
            prog="fabric_assessment_tool",
            description="Fabric Assessment Tool - Migration Assessment Tool for Fabric DE/DW",
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )

        parser.add_argument(
            "command",
            choices=["assess"],
            help="Command to execute",
        )

        return parser
