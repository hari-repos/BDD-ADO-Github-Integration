import * as SDK from 'azure-devops-extension-sdk';
import type { IWorkItemFormService } from 'azure-devops-extension-api/WorkItemTracking';
import type { IExtensionDataService, IExtensionDataManager } from 'azure-devops-extension-api/Common';

// We will dynamically import monaco so that if it throws a SecurityError at import time (due to sandboxed iframe),
// we can catch it!
// import * as monaco from 'monaco-editor';

let monaco: any;
let editor: any;
let activeWorkItemId: number | undefined;
let activeWorkItemTitle: string;
let formService: IWorkItemFormService;
let dataManager: IExtensionDataManager;

// DOM Elements
const repoInput = document.getElementById('repo-input') as HTMLInputElement;
const baseBranchInput = document.getElementById('base-branch-input') as HTMLSelectElement;
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

// Project Config
let githubPAT = '';
let githubRepo = '';
let githubBaseBranch = '';
let adoUserName = '';
let adoUserEmail = '';

// Disable Monaco workers entirely to comply with Azure DevOps iframe CSP.
(window as any).MonacoEnvironment = {
  getWorker: function () {
    return new Worker(
      URL.createObjectURL(new Blob([''], { type: 'application/javascript' }))
    );
  }
};

/**
 * Initializes the SDK and configures the editor UI.
 */
async function init() {
  const isLocal = window === window.parent;

  if (isLocal) {
    monaco = await import('monaco-editor');
    
    adoUserName = "Local Dev";
    githubRepo = "hari/local-repo";
    githubBaseBranch = "main";
    githubPAT = "mock-pat";
    activeWorkItemId = 123;
    activeWorkItemTitle = "Mock User Story";
    
    repoInput.value = githubRepo;
    baseBranchInput.value = githubBaseBranch;
    targetBranchInput.value = "feature/123-mock-story";
    filePathInput.value = "tests/features/pbi-123.feature";

    editor = monaco.editor.create(document.getElementById('editor-container')!, {
      value: [
        '# Enter your BDD scenarios here...',
        'Feature: Mock Feature',
        '',
        '  Scenario: Mock Scenario',
        '    Given local dev is working',
        '    Then it should render the UI'
      ].join('\n'),
      language: 'gherkin',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      lineHeight: 20
    });

    editor.onDidChangeModelContent(() => {
      validateGherkinSyntax();
    });

    saveButton.addEventListener('click', () => {
      showBanner("Local mock save triggered", "success");
    });
    bannerClose.addEventListener('click', () => hideBanner());

    syncStatusBadge.textContent = 'Local Dev Mode';
    syncStatusBadge.className = 'badge badge-success';
    validateFormState();
    return;
  }

  // 1. Initialize SDK without auto-notifying
  await SDK.init({ loaded: false });

  // 2. Register the contribution object IMMEDIATELY
  const workItemEvents = {
    onFieldChanged: async () => await loadWorkItemData(),
    onLoaded: async () => await loadWorkItemData(),
    onRefreshed: async () => await loadWorkItemData(),
    onSaved: async () => await loadWorkItemData()
  };
  SDK.register(SDK.getContributionId(), workItemEvents);

  // 3. Notify ADO we are loaded IMMEDIATELY, before any heavy async work or API calls
  // This prevents timeouts and race conditions.
  SDK.notifyLoadSucceeded();

  // Dynamically load Monaco so we can catch sandbox security errors
  monaco = await import('monaco-editor');

  await SDK.ready();

  const user = SDK.getUser();
  adoUserName = user.displayName;
  adoUserEmail = user.name; // In ADO SDK, name usually contains the email/UPN.

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

  editor.onDidChangeModelContent(() => {
    validateGherkinSyntax();
  });

  formService = await SDK.getService<IWorkItemFormService>("ms.vss-work-web.work-item-form");

  saveButton.addEventListener('click', () => saveAndPushToGitHub());
  bannerClose.addEventListener('click', () => hideBanner());

  try {
    activeWorkItemId = await formService.getId();
  } catch (e) {
    activeWorkItemId = 0;
  }
  
  try {
    const dataService = await SDK.getService<IExtensionDataService>("ms.vss-features.extension-data-service");
    const extensionContext = SDK.getExtensionContext();
    const accessToken = await SDK.getAccessToken();
    dataManager = await dataService.getExtensionDataManager(extensionContext.id, accessToken);
    
    await loadProjectConfig();
    await loadWorkItemData();
  } catch (err: any) {
    console.error("Error loading extension data:", err);
    showBanner(`Error loading settings: ${err.message}`, 'error');
  }
}

/**
 * Loads Project-Level Configuration instead of User-level.
 */
async function loadProjectConfig() {
  try {
    // Shared settings configured by Project Admin
    const savedRepo = await dataManager.getValue<string>('githubRepo', { scopeType: 'Default' });
    const savedBaseBranch = await dataManager.getValue<string>('githubBaseBranch', { scopeType: 'Default' });
    const savedPat = await dataManager.getValue<string>('githubPAT', { scopeType: 'Default' });

    if (savedRepo) githubRepo = savedRepo;
    if (savedBaseBranch) githubBaseBranch = savedBaseBranch;
    if (savedPat) githubPAT = savedPat;

    repoInput.value = githubRepo || 'Not Configured';
    
    if (githubRepo && githubPAT) {
      await populateBaseBranchDropdown();
    } else {
      baseBranchInput.innerHTML = `<option disabled selected>Not Configured</option>`;
    }

    if (!githubRepo || !githubPAT) {
      showBanner('GitHub integration is not configured. Please visit the BDD Settings in Project Settings to configure it.', 'error');
      const overlay = document.getElementById('missing-config-overlay');
      if (overlay) overlay.classList.remove('hidden');
      
      syncStatusBadge.textContent = "Missing Configuration";
      syncStatusBadge.className = "badge badge-warning";
      
      if (editor) {
        editor.updateOptions({ readOnly: true });
      }
    }
  } catch (err) {
    console.error("Failed to load Project config", err);
  }
}

/**
 * Fetches available branches from GitHub and populates the dropdown.
 */
async function populateBaseBranchDropdown() {
  const loader = document.getElementById('baseBranchLoader') as HTMLSpanElement;
  if (loader) loader.style.display = 'inline-block';
  
  try {
    const repo = getRepoFullName(githubRepo);
    const branchesData = await githubDirectFetch(`/repos/${repo}/branches`, 'GET');
    
    baseBranchInput.innerHTML = '';
    
    if (Array.isArray(branchesData)) {
      let foundConfigured = false;
      branchesData.forEach((b: any) => {
        const option = document.createElement('option');
        option.value = b.name;
        option.textContent = b.name;
        if (b.name === githubBaseBranch) {
          option.selected = true;
          foundConfigured = true;
        }
        baseBranchInput.appendChild(option);
      });
      
      if (!foundConfigured && branchesData.length > 0) {
        baseBranchInput.value = branchesData[0].name;
      } else if (branchesData.length === 0) {
        baseBranchInput.innerHTML = `<option disabled selected>No branches found</option>`;
      }
    } else {
      baseBranchInput.innerHTML = `<option disabled selected>Error loading branches</option>`;
      console.error('Failed to parse branches:', branchesData);
    }
  } catch (err: any) {
    console.error("Failed to fetch branches", err);
    baseBranchInput.innerHTML = `<option value="${githubBaseBranch || 'main'}">${githubBaseBranch || 'main'} (Offline)</option>`;
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

/**
 * Validates Gherkin syntax on the client-side.
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
 * Loads the current Work Item fields.
 */
async function loadWorkItemData() {
  try {
    if (!formService) {
      formService = await SDK.getService<IWorkItemFormService>("ms.vss-work-web.work-item-form");
    }

    const values = await formService.getFieldValues([
      'System.Title',
      'Custom.FeatureBranch',
      'Custom.FeatureFilePath'
    ]);

    activeWorkItemTitle = (values['System.Title'] as string) || '';
    const storedBranch = (values['Custom.FeatureBranch'] as string) || '';
    const storedFilePath = (values['Custom.FeatureFilePath'] as string) || '';

    if (!githubRepo || !githubPAT) return;

    if (storedBranch && storedFilePath) {
      syncStatusBadge.textContent = 'Linked to GitHub';
      syncStatusBadge.className = 'badge badge-success';

      targetBranchInput.value = storedBranch;
      filePathInput.value = storedFilePath;

      await fetchFileContentFromGitHub(githubRepo, storedBranch, storedFilePath);
    } else {
      syncStatusBadge.textContent = 'Not Connected';
      syncStatusBadge.className = 'badge badge-info';

      // Auto-generate strict branch name: feature/<id>-<title-lowercase>
      const cleanTitle = activeWorkItemTitle
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const generatedBranchName = `feature/${activeWorkItemId}-${cleanTitle.substring(0, 40)}`;
      targetBranchInput.value = generatedBranchName;
      filePathInput.value = `tests/features/pbi-${activeWorkItemId}.feature`;
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
  const isTargetBranchFilled = targetBranchInput.value.trim() !== "";
  const isFilePathFilled = filePathInput.value.trim() !== "";
  const isGherkinValid = validateGherkinSyntax();

  saveButton.disabled = !(githubRepo && githubPAT && isTargetBranchFilled && isFilePathFilled && isGherkinValid);
}

/**
 * Performs a direct fetch to the GitHub API, bypassing Azure DevOps proxy.
 */
async function githubDirectFetch(path: string, method: string = 'GET', body?: any) {
  const url = `https://api.github.com${path.startsWith('/') ? path : '/' + path}`;
  const response = await fetch(url, {
    method: method,
    headers: {
      'Authorization': `Bearer ${githubPAT}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.message || errorMsg;
    } catch (e) {}
    throw new Error(`GitHub API Error: ${response.status} ${errorMsg}`);
  }

  return response.json();
}

/**
 * Normalizes a GitHub repository string (which might be a full URL) into an 'owner/repo' format.
 */
function getRepoFullName(repoStr: string): string {
  try {
    if (repoStr.startsWith('http')) {
      const url = new URL(repoStr);
      return url.pathname.replace(/^\/|\.git$/g, '');
    }
  } catch (e) {
    // ignore
  }
  return repoStr.replace(/^\/|\.git$/g, '');
}

/**
 * Fetches existing feature file contents from GitHub via Proxy and puts them into the Monaco Editor.
 */
async function fetchFileContentFromGitHub(repo: string, branch: string, filePath: string) {
  try {
    const fullRepo = getRepoFullName(repo);
    const data = await githubDirectFetch(`/repos/${fullRepo}/contents/${filePath}?ref=${branch}`, 'GET');

    if (data && data.content) {
      const content = atob(data.content);
      editor.setValue(content);
      syncStatusBadge.textContent = 'Synced with Git Branch';
      syncStatusBadge.className = 'badge badge-success';
    }
  } catch (error: any) {
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      await handleDeletedOrMergedBranch(repo, filePath);
    } else {
      showBanner(`Failed to fetch file content: ${error.message}`, 'error');
    }
  }
}

/**
 * Fallback handler when the branch is not found. Checks if it was merged to the base branch.
 */
async function handleDeletedOrMergedBranch(repo: string, filePath: string) {
  try {
    const baseBranch = baseBranchInput.value || githubBaseBranch || 'main';
    const fullRepo = getRepoFullName(repo);
    const data = await githubDirectFetch(`/repos/${fullRepo}/contents/${filePath}?ref=${baseBranch}`, 'GET');

    if (data && data.content) {
      const content = atob(data.content);
      editor.setValue(content);
      syncStatusBadge.textContent = 'Merged (Read-only)';
      syncStatusBadge.className = 'badge badge-warning';
      showBanner(`Branch has been deleted. Loaded scenario from merged base branch '${baseBranch}'.`, 'success');
    }
  } catch (err) {
    syncStatusBadge.textContent = 'Not Synced';
    syncStatusBadge.className = 'badge badge-info';
  }
}

/**
 * Submits the scenario edits: creates branch if missing, commits file.
 */
async function saveAndPushToGitHub() {
  setSavingState(true);
  hideBanner();

  try {
    const repo = getRepoFullName(githubRepo);
    const baseBranch = baseBranchInput.value || githubBaseBranch;
    const targetBranch = targetBranchInput.value.trim();
    const filePath = filePathInput.value.trim();
    const fileContent = editor.getValue();
    const base64Content = btoa(unescape(encodeURIComponent(fileContent)));
    const commitMsg = `AB#${activeWorkItemId}: Update BDD scenario for ${activeWorkItemTitle} (by ${adoUserName})`;

    // 1. Get base branch SHA
    let baseSha: string | undefined;
    try {
      const baseBranchData = await githubDirectFetch(`/repos/${repo}/git/refs/heads/${baseBranch}`, 'GET');
      baseSha = baseBranchData?.object?.sha;
    } catch (e: any) {
      throw new Error(`Failed to access base branch '${baseBranch}'. Please verify that the branch exists, your Personal Access Token has 'repo' scope, and the repository URL is correct. (Inner Error: ${e.message})`);
    }

    if (!baseSha) {
      throw new Error(`Could not retrieve SHA for base branch '${baseBranch}'.`);
    }

    // 2. Try to create branch or ignore if exists
    try {
      await githubDirectFetch(
        `/repos/${repo}/git/refs`, 
        'POST', 
        { ref: `refs/heads/${targetBranch}`, sha: baseSha }
      );
    } catch (e: any) {
      if (!e.message.includes('already exists') && !e.message.includes('422')) {
        throw e;
      }
    }

    // 3. Check if file exists to get its SHA (required for updating)
    let existingSha: string | undefined = undefined;
    try {
      const fileData = await githubDirectFetch(`/repos/${repo}/contents/${filePath}?ref=${targetBranch}`, 'GET');
      existingSha = fileData?.sha;
    } catch (e: any) {
      if (!e.message.includes('404') && !e.message.includes('Not Found')) {
        throw e;
      }
    }

    // 4. Create/Update the file using the explicit GitHub Direct Fetch
    let commitSha = 'unknown';
    let isUnchanged = false;
    try {
      const response = await githubDirectFetch(
        `/repos/${repo}/contents/${filePath}`, 
        'PUT', 
        {
          message: commitMsg,
          content: base64Content,
          sha: existingSha,
          branch: targetBranch,
          author: {
            name: adoUserName,
            email: adoUserEmail || 'ado-user@example.com'
          },
          committer: {
            name: adoUserName,
            email: adoUserEmail
          }
        }
      );
      if (response && response.commit && response.commit.sha) {
        commitSha = response.commit.sha;
      } else {
        isUnchanged = true;
      }
    } catch (e: any) {
      // Ignore API error on 201 Created/200 OK which shouldn't happen unless parsing fails
      throw e;
    }
    
    // Update ADO custom fields
    await formService.setFieldValue('Custom.FeatureBranch', targetBranch);
    await formService.setFieldValue('Custom.FeatureFilePath', filePath);

    if (isUnchanged) {
      showBanner(`Successfully synced to GitHub, but no new commit was created because the file content was identical!`, 'success');
    } else {
      showBanner(`Successfully synced to GitHub (Commit: ${commitSha.substring(0, 7)}). Save User Story to persist links!`, 'success');
    }

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

function showBanner(message: string, type: 'success' | 'error' | 'info') {
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
  document.body.innerHTML = `<div style="background:white; color:red; padding: 20px; z-index:9999; position:absolute; top:0; left:0; width:100%; height:100%;">
    <h3>Init Failed</h3><p>${err.message}</p><pre>${err.stack}</pre>
  </div>`;
});
