import * as jwt from 'jsonwebtoken';

/**
 * Verifies that the incoming JWT was signed by the Azure DevOps extension secret.
 * This guarantees the request originates from our extension inside Azure DevOps.
 * 
 * @param authorizationHeader The raw 'Authorization' header from the request (e.g. "Bearer <token>")
 * @returns boolean true if the token is valid, false otherwise.
 */
export function verifyAdoToken(authorizationHeader: string | undefined): boolean {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.error('[Auth] Missing or invalid Authorization header format');
    return false;
  }

  const token = authorizationHeader.substring(7); // Remove 'Bearer '
  const secret = process.env.ADO_EXTENSION_SECRET;

  if (!secret) {
    console.error('[Auth] Server Configuration Error: ADO_EXTENSION_SECRET is not configured.');
    return false;
  }

  try {
    // Verifies the signature and expiration (exp claim)
    const decoded = jwt.verify(token, secret);
    console.log('[Auth] Token verified successfully for:', (decoded as any).sub || 'unknown');
    return true;
  } catch (error: any) {
    console.error('[Auth] Token validation failed:', error.message);
    return false;
  }
}
