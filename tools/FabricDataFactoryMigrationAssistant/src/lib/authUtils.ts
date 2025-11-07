/**
 * Utilities for token validation and handling
 */

import { AuthState } from '../types';

/**
 * Check if an access token is expired or about to expire
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) {
    return true;
  }

  try {
    // Parse JWT token to check expiration
    const base64Url = token.split('.')[1];
    if (!base64Url) {
      return true;
    }

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const payload = JSON.parse(jsonPayload);
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = payload.exp;

    // Consider token expired if it expires within 5 minutes
    return !expirationTime || currentTime >= (expirationTime - 300);
  } catch (error) {
    console.warn('Failed to parse token expiration:', error);
    return true;
  }
}

/**
 * Validate that auth state has all required fields and is not expired
 */
export function isValidAuthState(authState: AuthState | null): boolean {
  if (!authState) {
    return false;
  }

  return (
    authState.isAuthenticated &&
    !!authState.accessToken &&
    !isTokenExpired(authState.accessToken) &&
    !!authState.user &&
    !!authState.user.id &&
    !!authState.user.tenantId
  );
}

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) {
    return 'Unknown error occurred';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }

  return 'Unexpected error occurred';
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input.trim().replace(/[<>\"']/g, '');
}