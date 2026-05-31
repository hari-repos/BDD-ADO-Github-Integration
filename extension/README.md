# BDD Canvas for Boards

**BDD Canvas for Boards** is an Azure DevOps Work Item extension that empowers non-technical business teams to write, edit, and maintain BDD (Behaviour-Driven Development) scenarios in Gherkin format directly inside Azure Boards User Stories — without needing Git knowledge, command-line tools, or access to GitHub.

---

## What Problem Does This Solve?

In most software teams, BDD scenarios are written either:
- By developers directly in code editors (making them inaccessible to business users), or
- In Word/Excel documents that quickly go out of sync with the actual code.

**BDD Canvas for Boards** bridges this gap. Business analysts, product owners, and QA leads can now write the feature specifications once — directly on the Azure Boards User Story — and the content is automatically committed to the correct GitHub feature branch. Developers simply pull the branch and start implementing.

---

## How It Works

1. **Open any User Story** in Azure Boards.
2. **Click the "BDD Canvas" tab** (next to Details, History, and Links).
3. **Select your GitHub repository** and base branch from the dropdown menus.
4. **Write your BDD scenarios** in Gherkin format using the built-in syntax-highlighted editor.
5. **Click "Save & Push to GitHub"** — the extension will:
   - Automatically create a feature branch (e.g. `features/us-102-user-checkout`).
   - Commit your `.feature` file to that branch.
   - Link the commit back to the User Story via `AB#` syntax.
6. **Come back anytime** to update the scenarios. Every edit is committed as a new version on the same branch.

---

## Key Features

- 📝 **In-Browser Gherkin Editor** — Write `Feature:`, `Scenario:`, `Given`, `When`, `Then` steps with syntax highlighting.
- ✅ **Real-Time Syntax Validation** — The editor warns you of syntax errors before you can push, protecting your developers' pipelines.
- 🔗 **Automatic Work Item Linking** — Every commit is tagged with `AB#<WorkItemID>`, creating a live link in the User Story's Development panel.
- 🌿 **Branch Management Made Simple** — Choose any base branch and the extension suggests a standardised branch name automatically.
- 🔄 **Bi-Directional Sync** — If the feature branch is deleted after a Pull Request is merged, the extension falls back to showing the merged content in read-only mode.
- 🔒 **Zero GitHub Access Required for Business Users** — Credentials are managed securely on the backend. No PATs or Git configuration needed by your product team.

---

## Prerequisites

Before installing this extension, your Azure DevOps administrator must complete:

1. **Add three custom fields** to the User Story work item layout:
   - `Custom.BDDRepo` — The linked GitHub repository.
   - `Custom.BDDBranch` — The linked feature branch.
   - `Custom.BDDFilePath` — The file path of the `.feature` file.

2. **Deploy the BDD Canvas Sync Service** (Azure Function backend) and configure it with your GitHub App credentials.

3. **Connect your GitHub repositories** to Azure Boards using the Azure Boards GitHub App.

For full setup instructions, refer to the [Setup Guide](https://github.com/your-org/bdd-canvas-for-boards).

---

## Support & Feedback

If you encounter any issues or have suggestions, please raise a ticket via your internal support channel or the GitHub repository linked to this extension.

---

*BDD Canvas for Boards — Write requirements once. Deliver with confidence.*
