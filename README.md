# BDD Canvas for Boards - Azure DevOps & GitHub Enterprise Integration

This repository contains a solution to enable business teams to write and manage BDD scenarios in Gherkin format directly inside Azure DevOps User Stories using a visual BDD Canvas, syncing updates directly to a GitHub Enterprise repository branch using the user's Personal Access Token.

---

## Repository Structure

```
└── extension/                # Azure DevOps Work Item Tab Extension
    ├── src/
    │   ├── index.html        # Extension UI layout
    │   ├── index.css         # Glassmorphism visual theme
    │   └── index.ts          # Monaco editor and SDK control logic
    ├── package.json
    ├── tsconfig.json
    └── vss-extension.json    # Azure DevOps Extension Manifest
```

---

## Setup Guide

### Phase 1: Azure DevOps Process Customization
To store the repository configurations and branch locations on each User Story, you must add three custom fields to your Azure DevOps process template:

1. Go to **Organization Settings** > **Process**.
2. Select your inherited process template (e.g., *Inherited Agile* or *Inherited Scrum*).
3. Click on the **User Story** work item type.
4. Add the following three fields (select type as **Text (single line)** and mark them as read-only on the layout):
   - **Repository** (Reference Name: `Custom.BDDRepo`)
   - **Feature Branch** (Reference Name: `Custom.BDDBranch`)
   - **Feature File Path** (Reference Name: `Custom.BDDFilePath`)
5. Save the layout changes.

---

### Phase 2: Build & Publish the Azure DevOps Extension

#### 1. Build the Assets
```bash
cd extension
npm install
npm run build
```
This compiles the TypeScript code and bundles the Monaco Editor into the `/dist` directory.

#### 2. Package and Publish
Using the Microsoft Cross-Platform CLI (`tfx-cli`):
1. Create a publisher on the [Marketplace Console](https://marketplace.visualstudio.com/manage) if you don't have one.
2. Edit the `publisher` field in `vss-extension.json` to match your Marketplace publisher ID.
3. Package the extension:
   ```bash
   npx tfx-cli extension create --manifest-globs vss-extension.json
   ```
4. This produces a `.vsix` file. Go to the Marketplace Console, upload this `.vsix` file, and share it privately with your Azure DevOps Organization.
5. In Azure DevOps, go to **Organization Settings** > **Extensions**, select the shared extension, and click **Install**.

---

## How It Works (User Guide)

### 1. Configure GitHub Authentication (First-time setup per user)
Because the extension communicates directly with GitHub Enterprise from the browser, each business user must authenticate:
- Open any User Story and select the **Gherkin Editor** tab.
- Click the **Settings (Gear Icon)** in the top right of the Repository Configuration panel.
- Enter your **GitHub Enterprise API Base URL** (e.g., `https://github.company.com/api/v3`).
- Enter your **Personal Access Token (PAT)** with `repo` permissions.
- Click **Save Settings**. (Credentials are stored securely and encrypted via the ADO Extension Data Service).

### 2. Define Scenarios (Product Owner / Business)
- Choose your **Target GitHub Repository** and **Base Branch** (e.g., `main`).
- The branch name is automatically generated (e.g., `features/us-102-stripe-payment`).
- Write BDD scenarios using Gherkin syntax. The editor will validate syntax in real-time (errors are flagged in a warning box).
- Click **Save & Push to GitHub**. The system creates the branch and commits the `.feature` file via GitHub API.
- **Save the User Story** to persist the linked repository details!

### 3. Implement Scenarios (Developer)
- The branch and commits are automatically linked to the User Story's development details pane via the `AB#` format.
- The developer runs `git checkout features/us-102-stripe-payment` to get the feature file.
- The developer writes the code and step definitions to satisfy the BDD scenarios.

### 4. Update Scenarios
- If business users edit the scenario text in ADO later and click **Save & Push**, a new commit is pushed to the same feature branch.
- The developer pulls the updates (`git pull`) to keep scenarios in sync.
- Once completed, the developer merges the feature branch to `main` via a Pull Request.
