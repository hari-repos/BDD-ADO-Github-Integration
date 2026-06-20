/**
 * Normalizes a GitHub repository string (which might be a full URL) into an 'owner/repo' format.
 */
export function getRepoFullName(repoStr: string): string {
  if (!repoStr) return '';
  try {
    if (repoStr.startsWith('http')) {
      const url = new URL(repoStr);
      return url.pathname.replace(/^\/|\.git$/g, '');
    }
  } catch (e) {
    // ignore parsing errors
  }
  return repoStr.replace(/^\/|\.git$/g, '');
}

/**
 * Performs a direct fetch to the GitHub API.
 */
export async function githubDirectFetch(
  path: string,
  method: string,
  pat: string,
  body?: any
): Promise<any> {
  const url = `https://api.github.com${path.startsWith('/') ? path : '/' + path}`;
  const response = await fetch(url, {
    method: method,
    headers: {
      'Authorization': `Bearer ${pat}`,
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
    } catch (e) {
      // ignore
    }
    throw new Error(`GitHub API Error: ${response.status} ${errorMsg}`);
  }

  // 204 No Content won't have JSON body
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
