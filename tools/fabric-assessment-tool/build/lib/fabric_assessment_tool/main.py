import sys

from fabric_assessment_tool.cli.router import CLIRouter


def main():
    """Main entry point for the ll command."""
    try:
        router = CLIRouter()
        router.run(sys.argv[1:])
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
