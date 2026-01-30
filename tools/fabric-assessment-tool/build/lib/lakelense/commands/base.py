import argparse
from abc import ABC, abstractmethod
from typing import List


class BaseCommand(ABC):
    """Abstract base class for CLI commands."""

    @abstractmethod
    def get_name(self) -> str:
        """Return the command name."""
        pass

    @abstractmethod
    def get_description(self) -> str:
        """Return the command description."""
        pass

    @abstractmethod
    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Configure the argument parser for this command."""
        pass

    @abstractmethod
    def handle(self, args: argparse.Namespace) -> None:
        """Handle the command execution."""
        pass

    def execute(self, args: List[str]) -> None:
        """Execute the command with the given arguments."""
        parser = argparse.ArgumentParser(
            prog=f"ll {self.get_name()}",
            description=self.get_description(),
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )

        self.configure_parser(parser)
        parsed_args = parser.parse_args(args)
        self.handle(parsed_args)
