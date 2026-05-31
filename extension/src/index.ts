import * as SDK from 'azure-devops-extension-sdk';
import type { IWorkItemFormService } from 'azure-devops-extension-api/WorkItemTracking';
import * as monaco from 'monaco-editor';

// Configure the Azure Function endpoint here
const SYNC_SERVICE_BASE_URL = 'https://bdd-canvas-sync-function-fjc0hdcxdxdahwcr.eastasia-01.azurewebsites.net/api/syncbdd';

let editor: monaco.editor.IStandaloneCodeEditor;
let activeWorkItemId: number;
let activeWorkItemTitle: string;
let formService: IWorkItemFormService;

// DOM Elements
const repoSelect = document.getElementById('repo-select') as HTMLSelectElement;
const baseBranchSelect = document.getElementById('base-branch-select') as HTMLSelectElement;
const targetBranchInput = document.getElementById('target-branch-input') as HTMLInputElement;
const filePathInput = document.getElementById('file-path-input') as HTMLInputElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const saveSpinner = document.getElementById('save-spinner') as HTMLElement;
const saveBtnText = document.getElementById('save-btn-text') as HTMLElement;

const statusBanner = document.getElementById('status-banner') as HTMLDivElement;
const bannerMessage = document.getElementById('banner-message') as HTMLSpanElement;
const bannerClose = document.getElementById('banner-close') as HTMLButtonElement;

const syncStatusBadge = document.getElementById('sync-status-badge') as HTMLSpanElement;
const linterWarning = document.getElementById('linter-warning') as HTMLDivElement;
const linterWarningMessage = document.getElementById('linter-warning-message') as HTMLSpanElement;

// Disable Monaco workers entirely to comply with Azure DevOps iframe CSP.
// Monaco runs in single-threaded mode which is perfectly fine for Gherkin editing.
(window as any).MonacoEnvironment = {
  getWorker: function () {
    // Return a no-op worker-like object — avoids eval() and blob URL CSP violations.
    return new Worker(
      URL.createObjectURL(new Blob([''], { type: 'application/javascript' }))
    );
  }
};

/**
 * Initializes the SDK and configures the editor UI.
 */
async function init() {
  // IMPORTANT: SDK.register() MUST be called before SDK.ready().
  // The ADO host waits for the contribution to be registered before
  // it considers the extension fully loaded. Calling ready() first
  // causes a timeout and triggers the "failed to load" error.
  await SDK.init({ loaded: false });

  // Register the work item event handlers BEFORE signalling ready.
  const workItemEvents = {
    onFieldChanged: async () => {
      await loadWorkItemData();
    },
    onLoaded: async () => {
      await loadWorkItemData();
    },
    onRefreshed: async () => {
      await loadWorkItemData();
    },
    onSaved: async () => {
      await loadWorkItemData();
    }
  };
  SDK.register(SDK.getContributionId(), workItemEvents);

  // Now signal to ADO that the extension is loaded and ready.
  await SDK.ready();

  // 1. Initialize Monaco Editor (after SDK is ready)
  editor = monaco.editor.create(document.getElementById('editor-container')!, {
    value: [
      '# Enter your BDD scenarios here...',
      'Feature: User Story Feature Description',
      '',
      '  Scenario: Successful Scenario',
      '    Given the user is on the portal',
      '    When they perform an action',
      '    Then the outcome is successful'
    ].join('\n'),
    language: 'gherkin',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 20
  });

  // Attach linting listener
  editor.onDidChangeModelContent(() => {
    validateGherkinSyntax();
  });

  // 2. Fetch Azure DevOps Work Item Form Service
  formService = await SDK.getService<IWorkItemFormService>("ms.vss-work-web.work-item-form");
  activeWorkItemId = await formService.getId();

  // 3. Load initial configuration and fetch repos
  await loadWorkItemData();

  // 4. Attach event listeners
  repoSelect.addEventListener('change', () => onRepoChanged());
  baseBranchSelect.addEventListener('change', () => validateFormState());
  targetBranchInput.addEventListener('input', () => validateFormState());
  filePathInput.addEventListener('input', () => validateFormState());
  saveButton.addEventListener('click', () => saveAndPushToGitHub());
  bannerClose.addEventListener('click', () => hideBanner());
}

/**
 * Validates Gherkin syntax on the client-side to ensure the scenario is well-formed.
 */
function validateGherkinSyntax(): boolean {
  const content = editor.getValue().trim();
  if (!content || content.startsWith('#')) {
    hideLinterWarning();
    return true;
  }

  const lines = content.split('\n');
  let hasFeature = false;
  let hasScenario = false;
  let stepsWithoutScenarioCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('Feature:')) {
      hasFeature = true;
    } else if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
      hasScenario = true;
    } else if (
      line.startsWith('Given ') ||
      line.startsWith('When ') ||
      line.startsWith('Then ') ||
      line.startsWith('And ') ||
      line.startsWith('But ')
    ) {
      if (!hasScenario) {
        stepsWithoutScenarioCount++;
      }
    }
  }

  if (!hasFeature) {
    showLinterWarning("Missing 'Feature:' definition at the top of the file.");
    return false;
  }
  if (stepsWithoutScenarioCount > 0) {
    showLinterWarning(`Found BDD steps (Given/When/Then) not enclosed in a 'Scenario:' block.`);
    return false;
  }
  if (!hasScenario && content.length > 30) {
    showLinterWarning("Missing 'Scenario:' or 'Scenario Outline:' declaration.");
    return false;
  }

  hideLinterWarning();
  return true;
}

function showLinterWarning(msg: string) {
  linterWarningMessage.textContent = msg;
  linterWarning.classList.remove('hidden');
}

function hideLinterWarning() {
  linterWarning.classList.add('hidden');
}

/**
 * Loads the current Work Item fields and triggers repository fetching.
 */
async function loadWorkItemData() {
  try {
    const values = await formService.getFieldValues([
      'System.Title',
      'Custom.BDDRepo',
      'Custom.BDDBranch',
      'Custom.BDDFilePath'
    ]);

    activeWorkItemTitle = (values['System.Title'] as string) || '';
    const storedRepo = (values['Custom.BDDRepo'] as string) || '';
    const storedBranch = (values['Custom.BDDBranch'] as string) || '';
    const storedFilePath = (values['Custom.BDDFilePath'] as string) || '';

    // Initialize list of Repositories from backend
    await fetchRepositories(storedRepo);

    if (storedRepo) {
      // Branch exists
      syncStatusBadge.textContent = 'Linked to GitHub';
      syncStatusBadge.className = 'badge badge-success';

      await fetchBranchesForRepo(storedRepo, storedBranch);
      targetBranchInput.value = storedBranch;
      filePathInput.value = storedFilePath;

      // Fetch the file contents from GitHub
      await fetchFileContentFromGitHub(storedRepo, storedBranch, storedFilePath);
    } else {
      // New Integration setup: pre-populate default branch & file names
      syncStatusBadge.textContent = 'Not Connected';
      syncStatusBadge.className = 'badge badge-info';

      const cleanTitle = activeWorkItemTitle
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      targetBranchInput.value = `features/us-${activeWorkItemId}-${cleanTitle.substring(0, 30)}`;
      filePathInput.value = `tests/features/us-${activeWorkItemId}.feature`;
    }

    validateFormState();
  } catch (error: any) {
    showBanner(`Error loading Work Item: ${error.message}`, 'error');
  }
}

/**
 * Validates whether the form is filled out correctly to toggle the save button state.
 */
function validateFormState() {
  const isRepoSelected = repoSelect.value !== "";
  const isBaseBranchSelected = baseBranchSelect.value !== "";
  const isTargetBranchFilled = targetBranchInput.value.trim() !== "";
  const isFilePathFilled = filePathInput.value.trim() !== "";
  const isGherkinValid = validateGherkinSyntax();

  saveButton.disabled = !(isRepoSelected && isBaseBranchSelected && isTargetBranchFilled && isFilePathFilled && isGherkinValid);
}

/**
 * Fetches available repositories via our secure backend.
 */
async function fetchRepositories(selectValue?: string) {
  try {
    const token = await SDK.getAppToken();
    const response = await fetch(`${SYNC_SERVICE_BASE_URL}?action=repos`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json() as { repos: string[] };

    repoSelect.innerHTML = '<option value="" disabled>Choose a repository</option>';
    data.repos.forEach(repo => {
      const option = document.createElement('option');
      option.value = repo;
      option.textContent = repo;
      if (repo === selectValue) option.selected = true;
      repoSelect.appendChild(option);
    });

    repoSelect.disabled = false;
  } catch (error: any) {
    showBanner(`Failed to load GitHub repositories: ${error.message}`, 'error');
  }
}

/**
 * Handles repository selection changes by loading the repo's branches.
 */
async function onRepoChanged() {
  const repo = repoSelect.value;
  baseBranchSelect.disabled = true;
  baseBranchSelect.innerHTML = '<option value="" disabled selected>Loading branches...</option>';
  validateFormState();

  await fetchBranchesForRepo(repo);
}

/**
 * Fetches branches for a repository and populates the base branch selector.
 */
async function fetchBranchesForRepo(repoName: string, selectValue?: string) {
  try {
    const token = await SDK.getAppToken();
    const response = await fetch(`${SYNC_SERVICE_BASE_URL}?action=branches&repo=${encodeURIComponent(repoName)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json() as { branches: string[] };

    baseBranchSelect.innerHTML = '<option value="" disabled selected>Select base branch</option>';

    // Choose common defaults for base branch if not configured
    let defaultBase = selectValue || '';
    if (!defaultBase) {
      if (data.branches.includes('main')) defaultBase = 'main';
      else if (data.branches.includes('master')) defaultBase = 'master';
      else if (data.branches.includes('develop')) defaultBase = 'develop';
    }

    data.branches.forEach(branch => {
      const option = document.createElement('option');
      option.value = branch;
      option.textContent = branch;
      if (branch === defaultBase) option.selected = true;
      baseBranchSelect.appendChild(option);
    });

    baseBranchSelect.disabled = false;
    targetBranchInput.disabled = false;
    filePathInput.disabled = false;
    validateFormState();
  } catch (error: any) {
    showBanner(`Failed to load branches for ${repoName}: ${error.message}`, 'error');
  }
}

/**
 * Fetches existing feature file contents from GitHub and puts them into the Monaco Editor.
 */
async function fetchFileContentFromGitHub(repo: string, branch: string, filePath: string) {
  try {
    const token = await SDK.getAppToken();
    const url = `${SYNC_SERVICE_BASE_URL}?action=file&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&filePath=${encodeURIComponent(filePath)}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json() as { content: string | null };

    if (data.content !== null) {
      editor.setValue(data.content);
      syncStatusBadge.textContent = 'Synced with Git Branch';
      syncStatusBadge.className = 'badge badge-success';
    } else {
      // File not found on branch, check if branch was deleted after merge
      await handleDeletedOrMergedBranch(repo, filePath);
    }
  } catch (error: any) {
    showBanner(`Failed to fetch feature file content from GitHub: ${error.message}`, 'error');
  }
}

/**
 * Fallback handler when the branch is not found. Checks if it was merged to the base branch.
 */
async function handleDeletedOrMergedBranch(repo: string, filePath: string) {
  try {
    const token = await SDK.getAppToken();
    const baseBranch = baseBranchSelect.value || 'main';
    const url = `${SYNC_SERVICE_BASE_URL}?action=file&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(baseBranch)}&filePath=${encodeURIComponent(filePath)}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json() as { content: string | null };
      if (data.content) {
        editor.setValue(data.content);
        syncStatusBadge.textContent = 'Merged (Read-only)';
        syncStatusBadge.className = 'badge badge-warning';
        showBanner(`Branch has been deleted. Loaded scenario from merged base branch '${baseBranch}'.`, 'success');
      } else {
        syncStatusBadge.textContent = 'Not Synced';
        syncStatusBadge.className = 'badge badge-info';
      }
    }
  } catch (err) {
    console.error("Failed base branch merge fallback check", err);
  }
}

/**
 * Submits the scenario edits to the backend proxy to create the branch & commit the changes.
 */
async function saveAndPushToGitHub() {
  setSavingState(true);
  hideBanner();

  try {
    const repo = repoSelect.value;
    const baseBranch = baseBranchSelect.value;
    const targetBranch = targetBranchInput.value.trim();
    const filePath = filePathInput.value.trim();
    const fileContent = editor.getValue();

    const appToken = await SDK.getAppToken();

    const response = await fetch(SYNC_SERVICE_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appToken}`
      },
      body: JSON.stringify({
        repo,
        baseBranch,
        targetBranch,
        filePath,
        fileContent,
        workItemId: activeWorkItemId,
        workItemTitle: activeWorkItemTitle
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = 'Failed to sync to GitHub.';
      try {
        const errObj = JSON.parse(errorText);
        errorMsg = errObj.error || errorMsg;
      } catch {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json() as { commitSha: string; createdNewBranch: boolean };

    // Update ADO custom fields to link the files permanently
    await formService.setFieldValue('Custom.BDDRepo', repo);
    await formService.setFieldValue('Custom.BDDBranch', targetBranch);
    await formService.setFieldValue('Custom.BDDFilePath', filePath);

    // Prompt user to save the work item changes to save the updated BDD metadata fields
    showBanner(`Successfully synced BDD file to GitHub (Commit: ${data.commitSha.substring(0, 7)}). Please save this User Story to persist links!`, 'success');

    syncStatusBadge.textContent = 'Synced with Git Branch';
    syncStatusBadge.className = 'badge badge-success';

  } catch (error: any) {
    showBanner(`Error Syncing scenario: ${error.message}`, 'error');
  } finally {
    setSavingState(false);
  }
}

function setSavingState(isSaving: boolean) {
  saveButton.disabled = isSaving;
  if (isSaving) {
    saveSpinner.classList.remove('hidden');
    saveBtnText.textContent = 'Syncing...';
  } else {
    saveSpinner.classList.add('hidden');
    saveBtnText.textContent = 'Save & Push to GitHub';
    validateFormState();
  }
}

function showBanner(message: string, type: 'success' | 'error') {
  bannerMessage.textContent = message;
  statusBanner.className = `banner ${type}`;
  statusBanner.classList.remove('hidden');
}

function hideBanner() {
  statusBanner.classList.add('hidden');
}

// Start application
init().catch(err => {
  console.error("Extension initialization failed", err);
});
