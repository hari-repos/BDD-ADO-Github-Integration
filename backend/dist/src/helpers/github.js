"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGitHubClient = getGitHubClient;
exports.getFileContent = getFileContent;
exports.createBranch = createBranch;
exports.commitFile = commitFile;
exports.listBranches = listBranches;
exports.listRepositories = listRepositories;
const rest_1 = require("@octokit/rest");
const jwt = __importStar(require("jsonwebtoken"));
let cachedToken = null;
let tokenExpiry = 0;
/**
 * Generates an installation access token for the GitHub App.
 * Caches the token until it expires to optimize performance.
 */
async function getInstallationAccessToken() {
    const appId = process.env.GITHUB_APP_ID;
    let privateKey = process.env.GITHUB_PRIVATE_KEY;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
    if (!appId || !privateKey || !installationId) {
        throw new Error('GitHub App configuration (GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID) is incomplete.');
    }
    // Handle literal "\n" in environment variables
    privateKey = privateKey.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    // Return cached token if it's still valid (with a 2-minute buffer)
    if (cachedToken && tokenExpiry > now + 120) {
        return cachedToken;
    }
    // 1. Generate JWT for the GitHub App (valid for 10 minutes)
    const payload = {
        iat: now - 60, // 1 minute in past for clock skew
        exp: now + 540, // 9 minutes in future
        iss: appId
    };
    const appJwt = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    // 2. Fetch Installation Access Token from GitHub
    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${appJwt}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'BDD-ADO-Sync-Backend'
        }
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to fetch GitHub installation token: ${response.statusText}. Details: ${errorBody}`);
    }
    const data = await response.json();
    cachedToken = data.token;
    tokenExpiry = Math.floor(new Date(data.expires_at).getTime() / 1000);
    return cachedToken;
}
/**
 * Creates and returns an authenticated Octokit instance.
 * Supports GITHUB_PAT for local dev and GitHub App for production.
 */
async function getGitHubClient() {
    const pat = process.env.GITHUB_PAT;
    if (pat) {
        // Simple PAT Authentication (great for local testing/POC)
        return new rest_1.Octokit({
            auth: pat,
            userAgent: 'BDD-ADO-Sync-Backend'
        });
    }
    // App Authentication
    const token = await getInstallationAccessToken();
    return new rest_1.Octokit({
        auth: token,
        userAgent: 'BDD-ADO-Sync-Backend'
    });
}
/**
 * Fetches the contents of a file from a branch.
 * Returns null if the file or branch does not exist.
 */
async function getFileContent(repoFullName, branch, filePath) {
    const octokit = await getGitHubClient();
    const [owner, repo] = repoFullName.split('/');
    try {
        const response = await octokit.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: branch
        });
        if ('content' in response.data) {
            // Decode base64 content
            return Buffer.from(response.data.content, 'base64').toString('utf8');
        }
        return null;
    }
    catch (error) {
        if (error.status === 404) {
            console.log(`[GitHub] File '${filePath}' or branch '${branch}' not found in repo '${repoFullName}'`);
            return null;
        }
        throw error;
    }
}
/**
 * Creates a new branch from a base branch.
 * If the branch already exists, it is a no-op (returns false).
 */
async function createBranch(repoFullName, baseBranch, newBranch) {
    const octokit = await getGitHubClient();
    const [owner, repo] = repoFullName.split('/');
    // 1. Verify if branch already exists
    try {
        await octokit.repos.getBranch({
            owner,
            repo,
            branch: newBranch
        });
        console.log(`[GitHub] Branch '${newBranch}' already exists. Skipping creation.`);
        return false; // Already existed
    }
    catch (error) {
        if (error.status !== 404)
            throw error;
    }
    // 2. Fetch base branch SHA
    const refResponse = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`
    });
    const baseSha = refResponse.data.object.sha;
    // 3. Create new ref
    await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${newBranch}`,
        sha: baseSha
    });
    console.log(`[GitHub] Created branch '${newBranch}' from '${baseBranch}' (SHA: ${baseSha})`);
    return true;
}
/**
 * Commits a file (creates or updates) to a feature branch.
 * Returns the commit SHA.
 */
async function commitFile(repoFullName, branch, filePath, fileContent, commitMessage) {
    const octokit = await getGitHubClient();
    const [owner, repo] = repoFullName.split('/');
    // 1. Check if file already exists to get its SHA (required for updates)
    let existingSha;
    try {
        const fileResponse = await octokit.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: branch
        });
        if (Array.isArray(fileResponse.data)) {
            throw new Error(`Path '${filePath}' is a directory, not a file.`);
        }
        existingSha = fileResponse.data.sha;
    }
    catch (error) {
        if (error.status !== 404)
            throw error;
    }
    // 2. Create or Update file content
    const commitResponse = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: commitMessage,
        content: Buffer.from(fileContent).toString('base64'),
        branch,
        sha: existingSha
    });
    return commitResponse.data.commit.sha || '';
}
/**
 * Lists all branches in a repository.
 */
async function listBranches(repoFullName) {
    const octokit = await getGitHubClient();
    const [owner, repo] = repoFullName.split('/');
    const branches = await octokit.repos.listBranches({
        owner,
        repo,
        per_page: 100
    });
    return branches.data.map(b => b.name);
}
/**
 * Lists all repositories accessible to the integration client.
 */
async function listRepositories() {
    const octokit = await getGitHubClient();
    const pat = process.env.GITHUB_PAT;
    if (pat) {
        // For PAT, list current user's repos
        const repos = await octokit.repos.listForAuthenticatedUser({
            per_page: 100,
            sort: 'updated'
        });
        return repos.data.map(r => r.full_name);
    }
    // For GitHub App installation, list accessible repos
    const repos = await octokit.apps.listReposAccessibleToInstallation({
        per_page: 100
    });
    return repos.data.repositories.map(r => r.full_name);
}
//# sourceMappingURL=github.js.map