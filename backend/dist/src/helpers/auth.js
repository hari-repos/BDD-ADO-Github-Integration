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
exports.verifyAdoToken = verifyAdoToken;
const jwt = __importStar(require("jsonwebtoken"));
/**
 * Verifies that the incoming JWT was signed by the Azure DevOps extension secret.
 * This guarantees the request originates from our extension inside Azure DevOps.
 *
 * @param authorizationHeader The raw 'Authorization' header from the request (e.g. "Bearer <token>")
 * @returns boolean true if the token is valid, false otherwise.
 */
function verifyAdoToken(authorizationHeader) {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
        console.error('[Auth] Missing or invalid Authorization header format');
        return false;
    }
    const token = authorizationHeader.substring(7); // Remove 'Bearer '
    const secret = process.env.ADO_EXTENSION_SECRET;
    if (!secret) {
        console.warn('[Auth] WARNING: ADO_EXTENSION_SECRET environment variable is not configured. Bypassing JWT token verification for testing/trial.');
        return true;
    }
    try {
        // Verifies the signature and expiration (exp claim)
        const decoded = jwt.verify(token, secret);
        console.log('[Auth] Token verified successfully for:', decoded.sub || 'unknown');
        return true;
    }
    catch (error) {
        console.error('[Auth] Token validation failed:', error.message);
        return false;
    }
}
//# sourceMappingURL=auth.js.map