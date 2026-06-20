import * as SDK from 'azure-devops-extension-sdk';
import type { IExtensionDataService, IExtensionDataManager } from 'azure-devops-extension-api/Common';

let dataManager: IExtensionDataManager;

const repoInput = document.getElementById('admin-repo-input') as HTMLInputElement;
const branchInput = document.getElementById('admin-branch-input') as HTMLInputElement;
const patInput = document.getElementById('admin-pat-input') as HTMLInputElement;
const saveButton = document.getElementById('admin-save-button') as HTMLButtonElement;

const statusBanner = document.getElementById('status-banner') as HTMLDivElement;
const bannerMessage = document.getElementById('banner-message') as HTMLSpanElement;
const bannerClose = document.getElementById('banner-close') as HTMLButtonElement;

async function init() {
  await SDK.init({ loaded: false });
  await SDK.ready();

  const dataService = await SDK.getService<IExtensionDataService>("ms.vss-features.extension-data-service");
  const extensionContext = SDK.getExtensionContext();
  const accessToken = await SDK.getAccessToken();
  dataManager = await dataService.getExtensionDataManager(extensionContext.id, accessToken);

  await loadSettings();

  saveButton.addEventListener('click', saveSettings);
  bannerClose.addEventListener('click', hideBanner);

  SDK.notifyLoadSucceeded();
}

async function loadSettings() {
  try {
    const savedRepo = await dataManager.getValue<string>('githubRepo', { scopeType: 'Default' });
    const savedBranch = await dataManager.getValue<string>('githubBaseBranch', { scopeType: 'Default' });
    const savedPat = await dataManager.getValue<string>('githubPAT', { scopeType: 'Default' });

    if (savedRepo) repoInput.value = savedRepo;
    if (savedBranch) branchInput.value = savedBranch;
    if (savedPat) patInput.value = savedPat;

  } catch (error: any) {
    showBanner(`Failed to load settings: ${error.message}`, 'error');
  }
}

async function saveSettings() {
  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  hideBanner();

  const repo = repoInput.value.trim();
  const branch = branchInput.value.trim();
  const pat = patInput.value.trim();

  if (!repo || !branch || !pat) {
    showBanner('All fields are required.', 'error');
    saveButton.disabled = false;
    saveButton.textContent = 'Save Configuration';
    return;
  }

  try {
    // Note: 'Default' scope is equivalent to Project Scope when used in a Project Hub.
    await dataManager.setValue<string>('githubRepo', repo, { scopeType: 'Default' });
    await dataManager.setValue<string>('githubBaseBranch', branch, { scopeType: 'Default' });
    await dataManager.setValue<string>('githubPAT', pat, { scopeType: 'Default' });

    showBanner('Configuration saved securely for this project.', 'success');
  } catch (error: any) {
    showBanner(`Failed to save settings: ${error.message}`, 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save Configuration';
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

init().catch(err => {
  console.error("Failed to initialize admin hub", err);
});
