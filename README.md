# BDD Canvas for Boards - Azure DevOps & GitHub Integration

This repository contains a full solution to enable business teams to write and manage BDD scenarios in Gherkin format directly inside Azure DevOps User Stories using a visual BDD Canvas, syncing updates asynchronously to a GitHub repository branch.

---

## Repository Structure

```
├── backend/                  # Secure backend sync proxy (Azure Function)
│   ├── src/
│   │   ├── functions/        # Azure Function HTTP Endpoints
│   │   └── helpers/          # Authorization and GitHub REST API integrations
│   ├── package.json
│   └── tsconfig.json
│
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

### Phase 2: Register a GitHub App
To enable safe API access without exposing user tokens:
1. In your GitHub Organization, go to **Settings** > **Developer Settings** > **GitHub Apps** > **New GitHub App**.
2. Name the app (e.g., `ADO-BDD-Sync-Service`).
3. Set the **Homepage URL** to your company domain.
4. Disable **Webhook** (unless you want to handle PR merge webhooks).
5. Grant the following **Repository Permissions**:
   - **Contents**: `Read & Write` (to read feature files and commit edits)
   - **Metadata**: `Read-only` (default required permission)
6. Save the app and download the generated **Private Key (PEM)**.
7. Go to **Install App** in the sidebar and install the app on your target organization and repositories. Take note of the **Installation ID** in the URL or settings.

---

### Phase 3: Deploy the Backend Sync Service (Azure Function)

#### 1. Set Environment Variables
Deploy the backend Node.js serverless app (e.g., in Azure App Services/Functions). Configure the following Application Settings / Environment Variables:

| Environment Variable | Source / Description |
| :--- | :--- |
| `ADO_EXTENSION_SECRET` | Your unique Extension publisher certificate secret (retrieved from the Visual Studio Marketplace publisher portal). |
| `GITHUB_APP_ID` | The ID of your registered GitHub App. |
| `GITHUB_PRIVATE_KEY` | The full contents of the generated `.pem` private key file (replace newlines with `\n` if setting via single-line CLI). |
| `GITHUB_APP_INSTALLATION_ID` | The installation ID of the GitHub App in your organization. |
| `GITHUB_PAT` | *(Alternative/Dev)* A Personal Access Token. If set, this overrides GitHub App auth (convenient for local dev/testing). |

#### 2. Local Run
Install dependencies and start the local runtime:
```bash
cd backend
npm install
npm run start
```
The local API will start at `http://localhost:7071/api/syncBDD`.

#### 3. CORS Configuration
In the Azure Portal for your deployed Azure Function, go to **API** > **CORS** and add the following allowed origins (required for browser calls from ADO iframe):
- `https://dev.azure.com`
- `https://*.visualstudio.com`

---

### Phase 4: Build & Publish the Azure DevOps Extension

#### 1. Configure Endpoint
Open [extension/src/index.ts](file:///Users/hari/Documents/Workspace/Antigravity/BDD-ADO-Github-Integration/extension/src/index.ts) and replace `SYNC_SERVICE_BASE_URL` with your deployed Azure Function URL:
```typescript
const SYNC_SERVICE_BASE_URL = 'https://YOUR_FUNCTION_APP.azurewebsites.net/api/syncBDD';
```

#### 2. Build the Assets
```bash
cd extension
npm install
npm run build
```
This compiles the TypeScript code and bundles the Monaco Editor into the `/dist` directory.

#### 3. Package and Publish
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

### 1. Define Scenarios (Product Owner / Business)
- Open any User Story.
- Select the **Gherkin Editor** tab.
- Choose your **Target GitHub Repository** and **Base Branch** (e.g., `main`).
- The branch name is automatically generated (e.g., `features/us-102-stripe-payment`).
- Write BDD scenarios using Gherkin syntax. The editor will validate syntax in real-time (errors are flagged in a warning box).
- Click **Save & Push to GitHub**. The system creates the branch and commits the `.feature` file.
- **Save the User Story** to persist the linked repository details!

### 2. Implement Scenarios (Developer)
- The branch and commits are automatically linked to the User Story's development details pane via the `AB#` format.
- The developer runs `git checkout features/us-102-stripe-payment` to get the feature file.
- The developer writes the code and step definitions to satisfy the BDD scenarios.

### 3. Update Scenarios
- If business users edit the scenario text in ADO later and click **Save & Push**, a new commit is pushed to the same feature branch.
- The developer pulls the updates (`git pull`) to keep scenarios in sync.
- Once completed, the developer merges the feature branch to `main` via a Pull Request.
