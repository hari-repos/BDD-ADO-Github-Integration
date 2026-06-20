# BDD Canvas for Boards - Azure DevOps & GitHub Integration

This Azure DevOps Work Item extension enables business teams, product owners, and QA engineers to write and manage Behavior-Driven Development (BDD) scenarios directly inside Azure DevOps User Stories using a visual, Gherkin-aware editor. 

Updates made in the ADO UI are automatically synced to a target GitHub repository branch using the user's GitHub Personal Access Token (PAT), keeping the business requirements and the codebase perfectly aligned.

---

## 🌟 Key Features

1. **Embedded Monaco Editor**: Write BDD scenarios with Gherkin syntax highlighting inside Azure DevOps.
2. **Direct GitHub Sync**: Eliminates manual copy-pasting. Saving the scenario pushes it directly to a feature branch in your GitHub repo.
3. **Automated Branch Linking**: Branch names and file paths are automatically generated based on the User Story ID, and are tracked on the User Story itself.
4. **Project-Level Configuration**: Securely configure your GitHub integration once per project via the **BDD GitHub Settings** Admin Hub.

---

## 🛠 Setup Guide

### Phase 1: Azure DevOps Process Customization
To track which GitHub branch and file a User Story is linked to, add two custom fields to your ADO process template:

1. Go to **Organization Settings** > **Process**.
2. Select your inherited process template (e.g., *Inherited Agile* or *Inherited Scrum*).
3. Click on the **User Story** (or your target) work item type.
4. Add the following two fields (select type as **Text (single line)** and mark them as read-only on the layout):
   - **Feature Branch** (Reference Name: `Custom.FeatureBranch`)
   - **Feature File Path** (Reference Name: `Custom.FeatureFilePath`)
5. Save the layout changes.

### Phase 2: Build & Publish the Azure DevOps Extension

1. **Build the Assets**
   ```bash
   cd extension
   npm install
   npm run build
   ```
2. **Package the Extension**
   Ensure your publisher ID is updated in `vss-extension.json`, then run:
   ```bash
   npx tfx-cli extension create --manifest-globs vss-extension.json
   ```
3. **Publish & Install**
   Upload the generated `.vsix` file to the [Marketplace Console](https://marketplace.visualstudio.com/manage) and share it with your Azure DevOps Organization. Go to **Organization Settings** > **Extensions** to install it.

---

## 🚀 How It Works (User Guide)

### 1. Configure the Project (Project Administrators)
Instead of configuring GitHub connection on every User Story, Project Administrators can set this up once:
- Go to your Project's **Project Settings**.
- Navigate to **BDD GitHub Settings** under the Extensions tab.
- Enter your **Target GitHub Repository** (e.g. `my-org/my-repo`), **Base Branch** (e.g. `main`), and a **Personal Access Token (PAT)** with `repo` permissions.
- Click **Save Configuration**.

### 2. Define Scenarios (Product Owner / Business)
- Open any User Story and navigate to the **BDD Canvas** tab.
- The extension automatically suggests a Feature Branch name (e.g., `feature/123-your-story-title`).
- Select your base branch from the dropdown.
- Write your BDD scenarios using Gherkin syntax. Real-time linting will warn you if you miss required keywords like `Feature:` or `Scenario:`.
- Click **Save & Push to GitHub**. The system will create the branch (if missing) and commit the `.feature` file via the GitHub API, attributing the commit to you.
- **IMPORTANT**: Click the standard **Save** button on the User Story to save the branch link to ADO!

### 3. Implement Scenarios (Developer)
- The branch and commits are now linked to the User Story.
- The developer runs `git checkout <branch-name>` locally.
- The developer writes step definitions to satisfy the BDD scenarios, and creates a Pull Request when finished!
