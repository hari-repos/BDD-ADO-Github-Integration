# Customer Onboarding Guide: BDD Canvas for Azure Boards

Welcome to the **BDD Canvas for Azure Boards**! This guide will walk you through the end-to-end setup and usage of the extension so your team can start collaborating on Behavior-Driven Development (BDD) scenarios directly inside Azure DevOps.

---

## What is the BDD Canvas?
The BDD Canvas is a custom extension for Azure DevOps that allows business users, product owners, and QA engineers to write BDD scenarios (using Given/When/Then Gherkin syntax) directly inside Azure DevOps User Stories. 

When you hit save, the extension automatically pushes your scenarios to a feature branch in your GitHub repository, keeping your business requirements perfectly synchronized with your codebase—no Git knowledge or terminal required!

![BDD Canvas Editor View](/Users/hari/Documents/Workspace/Antigravity/BDD-ADO-Github-Integration/bdd_editor_ui.png)

---

## 1. Initial Setup (Project Administrators Only)

Before your team can start writing BDD scenarios, a Project Administrator needs to set up the Azure DevOps project.

### Step 1.1: Add Custom Fields to the Process Template
The extension needs two text fields on your User Story to keep track of the GitHub feature branch and file path.

1. Go to your Azure DevOps **Organization Settings** > **Process**.
2. Select the inherited process your project uses (e.g., *Inherited Agile*).
3. Click on the **User Story** work item type.
4. Click **New field** and add the following two fields (mark them as **Read-only** in the Layout tab):
   - **Feature Branch** (Reference Name: `Custom.FeatureBranch`)
   - **Feature File Path** (Reference Name: `Custom.FeatureFilePath`)
5. Save the layout changes.

### Step 1.2: Install the Extension
1. Go to your **Organization Settings** > **Extensions**.
2. Click **Browse marketplace**, search for the "BDD Canvas for Boards" extension, and install it to your organization.

### Step 1.3: Configure the GitHub Integration
We need to connect your ADO Project to your GitHub Repository.
1. Navigate to your Azure DevOps **Project**.
2. Click on **Project Settings** (gear icon at the bottom left).
3. Under the *Extensions* section, click on **BDD GitHub Settings**.
4. Enter the details:
   - **Target GitHub Repository**: e.g. `my-company/my-webapp`
   - **Base Branch**: e.g. `main` or `develop`
   - **GitHub Personal Access Token (PAT)**: A PAT belonging to a service account or yourself with `repo` scopes.
5. Click **Save Configuration**.

---

## 2. Using the BDD Canvas (Product Owners & QA)

Once the setup is complete, writing BDD scenarios is a breeze!

### Creating a New Scenario
1. Open any **User Story** in Azure DevOps.
2. Click on the **BDD Canvas** tab located next to *Details* and *History*.
3. You will see the visual editor interface. The branch name and file path will be automatically generated for you.
4. Write your scenario in the editor using standard Gherkin syntax:
   ```gherkin
   Feature: User Login
     Scenario: Successful Login
       Given the user is on the login page
       When they enter valid credentials
       Then they are redirected to the dashboard
   ```
5. Click **Save & Push to GitHub** at the bottom right.
6. A success banner will appear. Finally, click the standard **Save** icon at the top of the User Story to save the Azure DevOps work item.

### Updating a Scenario
If you need to change the acceptance criteria later:
1. Open the User Story and go to the **BDD Canvas** tab.
2. Modify the text in the editor.
3. Click **Save & Push to GitHub**. The changes are immediately committed to the existing feature branch!

---

## 3. Implementing Scenarios (Developers)

The business team has written the scenario and it's already in GitHub!
1. Look at the User Story in Azure DevOps. Under the **Development** section on the right-hand panel, you will see a link to a GitHub branch and commit (e.g., `feature/123-user-login`).
2. In your terminal, run `git fetch` and checkout the branch:
   ```bash
   git checkout feature/123-user-login
   ```
3. You will find the `.feature` file in your repository.
4. Write the step definitions and application code to make the tests pass.
5. Submit a Pull Request to merge the feature branch into the base branch.

> [!TIP]
> Do not delete the `.feature` file during your work! The ADO extension relies on it to sync future changes made by the product owner.
