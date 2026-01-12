# Pull Request

<!--
    Thanks for submitting a Pull Request (PR) to this project.
    Your contribution to this project is greatly appreciated!

    TITLE: Please be descriptive not sensationalist.
    Also prepend with [BREAKING CHANGE] if relevant.
    i.e. [BREAKING CHANGE][xFile] Add security descriptor property

    You may remove this comment block, and the other comment blocks, but please
    keep the headers and the task list.
    Try to keep your PRs atomic: changes grouped in smallest batch affecting a single logical unit.

    PLEASE DO NOT submit PRs that contain multiple unrelated changes.
    If you have multiple changes, please submit them in separate PRs.
-->

## Pull Request (PR) description

<!--
    Replace this comment block with a description of your PR to provide context.
    Please be describe the intent and link issue where the problem has been discussed.
    try to link the issue that it fixes by providing the verb and ref: [fix|close #18]

    After the description, please concisely list the changes as per keepachangelog.com
    This **should** duplicate what you've updated in the changelog file.

    for example:

### Added
- for new features [closes #15]
### Changed
- for changes in existing functionality.
### Deprecated
- for soon-to-be removed features.
### Security
- in case of vulnerabilities.
### Fixed
- for any bug fixes. [fix #52]
### Removed
- for now removed features.
-->

## Task list

<!--
    To aid community reviewers in reviewing and merging your PR, please take
    the time to run through the below checklist and make sure your PR has
    everything updated as required.

    Change to [x] for each task in the task list that applies to your PR.
    For those task that don't apply to you PR, leave those as is.
-->

- [ ] The PR represents a single logical change. i.e. Cosmetic updates should go in different PRs.
- [ ] Added an entry under the Unreleased section of in the CHANGELOG.md as per [format](https://keepachangelog.com/en/1.0.0/).
- [ ] Local clean build passes without issue or fail tests (`build.ps1 -ResolveDependency -Tasks build, test`).
- [ ] Comment-based help added/updated.
- [ ] Examples appropriately added/updated.
- [ ] Unit tests added/updated..
- [ ] Integration tests added/updated (where possible).
- [ ] Documentation added/updated (where applicable).
- [ ] Code follows the [contribution guidelines](../README.md#contributing).
