import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
}

/**
 * Hash an API key for secure storage
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  return `tl_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Count characters in text (excluding whitespace for cost estimation)
 */
export function countChars(text: string): number {
  return text.length;
}

/**
 * Normalize whitespace in text
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Check if text is mostly symbols or numbers
 */
export function isMostlySymbolsOrNumbers(text: string): boolean {
  const alphaChars = text.replace(/[^a-zA-Z\u00C0-\u017F\u0400-\u04FF\u4E00-\u9FFF]/g, '');
  return alphaChars.length < text.length * 0.3;
}

/**
 * Apply glossary preservation - wrap terms that should not be translated
 */
export function applyGlossary(text: string, preserveTerms: string[]): string {
  let result = text;
  for (const term of preserveTerms) {
    // Use word boundaries to avoid partial matches
    const regex = new RegExp(`\\b(${escapeRegex(term)})\\b`, 'gi');
    result = result.replace(regex, `<keep>$1</keep>`);
  }
  return result;
}

/**
 * Remove glossary markers after translation
 */
export function removeGlossaryMarkers(text: string): string {
  return text.replace(/<\/?keep>/g, '');
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
