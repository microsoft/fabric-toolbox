# Contributing to the MicrosoftFabricMgmt Module

## Welcome

Before we go any further, thanks for being here. Thanks for using the module and especially thanks for being here and looking into how you can help!

## Develop & Build

We are using the [Sampler](https://github.com/gaelcolas/Sampler) Powershell Module to structure our module. This makes it easier to develop and test the module locally.

The workflow for using this and developing the code is shown below.

1. Download or fork or clone the repo locally and create a new branch to develop on

   ```PowerShell
   git checkout -b newStuff # give it a proper name!
   ```

2. Make sure you have the latest Microsoft.PowerShell.PSResourceGet module

   ```PowerShell
   -- Find the latest version on the gallery
   Find-Module Microsoft.PowerShell.PSResourceGet

   -- Install side-by-side
   Install-Module Microsoft.PowerShell.PSResourceGet -Force
   ```

3. Start a fresh new PowerShell session to avoid anything from your current working sessions to interfere with the module development and building. Develop your updates in the source directory.

You should also resolve all dependencies before you start developing. This will ensure that you have all the required modules, and only them, installed and loaded into your session.

   ```PowerShell
   .\tools\MicrosoftFabricMgmt\build.ps1 -ResolveDependency -Tasks noop -UsePSResourceGet 
   ```

   | :heavy_exclamation_mark: **Important**        |
   | :-------------------------------------------- |
   | **YOU MUST DEVELOP IN THE SOURCE DIRECTORY.** |

   This is important because the build process will create a new folder in the root of the repository called `output` and this is where the module will be built and loaded from.

   If you change the code in the output folder and then build the module again, it will overwrite the changes you made.

   Ask Rob how he knows this!

4. Use GitHub CoPilot to write your commit messages by clicking on the sparkles in the commit message box. This will generate a commit message based on the changes you made. You can then edit the message to make it more descriptive if you want. This uses the prompt in the `.github\copilot-commit-message-instructions.md` file.

   Add this to your VS Code settings to enable it:

   ```json
   "github.copilot.chat.commitMessageGeneration.instructions": [
           {
               "file": ".github/copilot-commit-message-instructions.md"
           }
   ],
   ```

5. Build the module. From the root of the repository run the following command:

   ```PowerShell
   .\tools\MicrosoftFabricMgmt\build.ps1 -Tasks build
   
   ```

   This will build the module and create a new folder in the root of the repository called `output`. It will also load the new module into your current session.

6. **AFTER** building, you can then run the Pester tests to ensure that everything is working as expected. The tests are located in the `tests` folder and can be run using the following command:

   ```PowerShell
   Invoke-Pester tools/MicrosoftFabricMgmt/tests/
   ```

   This will run all the tests in the `tests` folder and output the results to the console. You can also run specific tags such as `FunctionalQuality`, `TestQuality`, `HelpQuality`.

7. You can also simulate the deployment testing by running the following command:

   ```PowerShell
   .\tools\MicrosoftFabricMgmt\build.ps1 -Tasks build,test
   ```
   This will run all the tests in the `tests` folder and output the results to the console. If there are any issues with the code, they will be reported here.
   
8. It is always a good idea to develop in a brand new clean session and also once you have finished your changes, you should open a new session, build the module and run a few commands to ensure that everything is working as expected. This will help you catch any issues that may have been introduced during development and also make sure that you have not missed any dependancies.

9. Once you are ready to submit your changes for review please ensure that you update the `CHANGELOG.md` file with a summary of your changes. This is important as it helps us keep track of what has changed in the module and makes it easier for users to see what has been added or changed.

   You can use the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format for this.
   
   Please add your changes under the `Unreleased` section and then create a new section for the next release. PLease use human readable titles for the changes, such as `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, and `Security`.
   For example:

   ```markdown
   ## [Unreleased]
   ### Added
   - Added new function to manage Fabric workspaces.
   ### Changed
   - Updated documentation for `Get-FabricAPIClusterURI`.
   ### Fixed
   - Fixed issue with `New-FabricDataPipeline` not working correctly.
   ```
9. Once you are happy with your code and you have updated the changelog, push your branch to GitHub and create a PR against the fabric-toolbox repo.

## Thanks!

Your PR will be reviewed by one of the maintainers and merged into the main branch if everything looks good. Thanks again for your contribution!
