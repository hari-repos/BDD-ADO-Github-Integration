"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncBDD = syncBDD;
const functions_1 = require("@azure/functions");
const auth_1 = require("../helpers/auth");
const github_1 = require("../helpers/github");
// Helper to construct standard CORS headers
function getCorsHeaders(request) {
    const origin = request.headers.get('origin') || '*';
    // Validate origin to ensure it matches Azure DevOps or local debug domains
    const allowedOrigin = (origin.startsWith('https://dev.azure.com') ||
        origin.endsWith('.visualstudio.com') ||
        origin.endsWith('.gallery.vsassets.io') ||
        origin === 'https://localhost:5173')
        ? origin
        : 'https://dev.azure.com';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400', // 24 hours
        'Content-Type': 'application/json'
    };
}
async function syncBDD(request, context) {
    context.log(`[SyncBDD] Processing ${request.method} request...`);
    const corsHeaders = getCorsHeaders(request);
    // 1. Handle CORS preflight request
    if (request.method === 'OPTIONS') {
        return {
            status: 204,
            headers: corsHeaders
        };
    }
    // 2. Authenticate the ADO Extension App Token
    const authHeader = request.headers.get('authorization') || undefined;
    if (!(0, auth_1.verifyAdoToken)(authHeader)) {
        return {
            status: 401,
            headers: corsHeaders,
            jsonBody: { error: 'Unauthorized: Invalid ADO Extension App Token.' }
        };
    }
    try {
        // ==========================================
        // GET Requests: Fetching Repos, Branches, Files
        // ==========================================
        if (request.method === 'GET') {
            const action = request.query.get('action');
            // Action: List repos
            if (action === 'repos') {
                const repos = await (0, github_1.listRepositories)();
                return {
                    status: 200,
                    headers: corsHeaders,
                    jsonBody: { repos }
                };
            }
            // Action: List branches for a repo
            if (action === 'branches') {
                const repo = request.query.get('repo');
                if (!repo) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { error: "Missing parameter 'repo'" }
                    };
                }
                const branches = await (0, github_1.listBranches)(repo);
                return {
                    status: 200,
                    headers: corsHeaders,
                    jsonBody: { branches }
                };
            }
            // Action: Get file content
            if (action === 'file') {
                const repo = request.query.get('repo');
                const branch = request.query.get('branch');
                const filePath = request.query.get('filePath');
                if (!repo || !branch || !filePath) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { error: "Missing parameter 'repo', 'branch', or 'filePath'" }
                    };
                }
                const content = await (0, github_1.getFileContent)(repo, branch, filePath);
                return {
                    status: 200,
                    headers: corsHeaders,
                    jsonBody: { content }
                };
            }
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { error: `Invalid action: '${action}'` }
            };
        }
        // ==========================================
        // POST Requests: Save & Commit Scenarios
        // ==========================================
        if (request.method === 'POST') {
            const body = await request.json();
            const { repo, baseBranch, targetBranch, filePath, fileContent, workItemId, workItemTitle } = body;
            if (!repo || !baseBranch || !targetBranch || !filePath || fileContent === undefined || !workItemId) {
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { error: 'Missing required request body parameters.' }
                };
            }
            context.log(`[SyncBDD] Syncing file '${filePath}' to repo '${repo}', branch '${targetBranch}'...`);
            // 1. Create target branch from base branch (no-op if branch already exists)
            const createdNewBranch = await (0, github_1.createBranch)(repo, baseBranch, targetBranch);
            context.log(`[SyncBDD] Branch check completed. Created new branch? ${createdNewBranch}`);
            // 2. Commit file to target branch
            // Prefixing the commit message with "AB#{id}" automatically links it in Azure Boards
            const cleanTitle = workItemTitle ? ` - ${workItemTitle.substring(0, 50)}` : '';
            const commitMessage = `AB#${workItemId}: Sync BDD scenario from Azure Boards${cleanTitle}`;
            const commitSha = await (0, github_1.commitFile)(repo, targetBranch, filePath, fileContent, commitMessage);
            context.log(`[SyncBDD] Committed file successfully. SHA: ${commitSha}`);
            return {
                status: 200,
                headers: corsHeaders,
                jsonBody: {
                    message: 'BDD file synced successfully.',
                    branch: targetBranch,
                    filePath,
                    commitSha,
                    createdNewBranch
                }
            };
        }
        return {
            status: 405,
            headers: corsHeaders,
            jsonBody: { error: `Method ${request.method} not allowed` }
        };
    }
    catch (error) {
        context.log(`[SyncBDD] Error occurred: ${error.message}`);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: {
                error: 'An internal error occurred while syncing with GitHub.',
                details: error.message
            }
        };
    }
}
// Register the Azure Function
functions_1.app.http('syncBDD', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous', // Authentication is done custom inside the function using verifyAdoToken()
    handler: syncBDD
});
//# sourceMappingURL=syncBDD.js.map