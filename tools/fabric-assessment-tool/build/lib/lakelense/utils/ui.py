import builtins
import sys
from typing import Any, Optional, Sequence

import questionary


def get_common_style():
    return questionary.Style(
        [
            ("qmark", "fg:#49C5B1"),
            ("question", ""),
            ("answer", "fg:#6c6c6c"),
            ("pointer", "fg:#49C5B1"),
            ("highlighted", "fg:#49C5B1"),
            ("selected", "fg:#49C5B1"),
            ("separator", "fg:#6c6c6c"),
            ("instruction", "fg:#49C5B1"),
            ("text", ""),
            ("disabled", "fg:#858585 italic"),
        ]
    )


def prompt_ask(text: str = "Question") -> Any:
    return questionary.text(text, style=get_common_style()).ask()


def prompt_password(text: str = "password") -> Any:
    return questionary.password(text, style=get_common_style()).ask()


def prompt_confirm(text: str = "Are you sure?") -> Any:
    return questionary.confirm(text, style=get_common_style()).ask()


def prompt_select_items(question: str, choices: Sequence) -> Any:
    selected_items = questionary.checkbox(
        question, choices=choices, pointer=">", style=get_common_style()
    ).ask()

    return selected_items


def prompt_select_item(question: str, choices: Sequence) -> Any:
    # Prompt the user to select a single item from a list of choices
    selected_item = questionary.select(
        question, choices=choices, pointer=">", style=get_common_style()
    ).ask()

    return selected_item


def print(text: str) -> None:
    _safe_print(text)


def print_fat(text: str) -> None:
    _safe_print(text, style="fg:#49C5B1")


def print_grey(text: str, to_stderr: bool = True) -> None:
    _safe_print(text, style="fg:grey", to_stderr=to_stderr)


def print_progress(text, progress: Optional[str] = None) -> None:
    progress_text = f": {progress}%" if progress else ""
    print_grey(f"∟ {text}{progress_text}")


def _safe_print(
    text: str, style: Optional[str] = None, to_stderr: bool = False
) -> None:

    try:
        # Redirect to stderr if `to_stderr` is True
        output_stream = sys.stderr if to_stderr else sys.stdout
        questionary.print(text, style=style, file=output_stream)

    except (RuntimeError, AttributeError, Exception) as e:
        _print_fallback(text, e, to_stderr=to_stderr)


def _print_fallback(text: str, e: Exception, to_stderr: bool = False) -> None:
    # Fallback print
    # https://github.com/prompt-toolkit/python-prompt-toolkit/issues/406
    output_stream = sys.stderr if to_stderr else sys.stdout
    builtins.print(text, file=output_stream)
    if isinstance(e, AttributeError):  # Only re-raise AttributeError (pytest)
        raise
