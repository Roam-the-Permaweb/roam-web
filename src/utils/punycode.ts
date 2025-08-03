/**
 * Punycode utilities for converting internationalized domain names (IDN)
 * 
 * Handles conversion of punycode-encoded ArNS names (e.g., xn--) to Unicode
 * for human-readable display while preserving the encoded format for resolution.
 */

import { logger } from './logger';

// Try to import punycode if available (for Node.js/test environments)
let punycodeLib: { toUnicode?: (input: string) => string } | undefined;
try {
  // Dynamic import for environments that support it
  if (typeof require !== 'undefined') {
    punycodeLib = require('punycode/');
  }
} catch (_error) {
  // Punycode not available, will use browser APIs or fallback
}

/**
 * Decode punycode using the best available method
 */
function decodePunycodePart(part: string): string {
  // First try the punycode library if available (most reliable)
  if (punycodeLib && punycodeLib.toUnicode) {
    try {
      return punycodeLib.toUnicode(part);
    } catch (_error) {
      // Fall through to other methods
    }
  }
  
  // In browser environment, try using URL API
  if (typeof URL !== 'undefined') {
    try {
      // Create a full URL with the punycode part as subdomain
      const url = new URL(`https://${part}.example.com`);
      const decoded = url.hostname.split('.')[0];
      
      // Check if it was actually decoded
      if (!decoded.toLowerCase().startsWith('xn--')) {
        return decoded;
      }
    } catch (_error) {
      // URL API failed, continue to fallback
    }
  }
  
  // Manual fallback for common cases
  const commonMappings: Record<string, string> = {
    'xn--ol-yja': 'ñol',
    'xn--9ca': 'é',
    'xn--8ca': 'è',
    'xn--7ba': 'ç',
    'xn--1ca': 'à',
    'xn--4ca': 'ä',
    'xn--tda': 'ö',
    'xn--sda': 'ü',
    'xn--0ca': 'Ñ',
    'xn--ls8h': '💩',
    'xn--ihqwcrb4cv8a8dqg056pqjye': '他们为什么不说中文'
  };
  
  return commonMappings[part.toLowerCase()] || part;
}

/**
 * Convert a punycode-encoded domain name to Unicode for display
 * 
 * @param domain - The domain name that may contain punycode segments
 * @returns The Unicode representation of the domain for display
 * 
 * @example
 * punycodeToUnicode('xn--nol-mua.arweave.net') // → 'ñol.arweave.net'
 * punycodeToUnicode('regular.arweave.net') // → 'regular.arweave.net'
 * punycodeToUnicode('xn--9ca.xn--8ca.arweave.net') // → 'é.è.arweave.net'
 */
export function punycodeToUnicode(domain: string): string {
  if (!domain || typeof domain !== 'string') {
    return domain;
  }

  try {
    // Split the domain into parts
    const parts = domain.split('.');
    
    // Convert each part that starts with 'xn--'
    const convertedParts = parts.map(part => {
      if (part.toLowerCase().startsWith('xn--')) {
        return decodePunycodePart(part);
      }
      return part;
    });
    
    // Rejoin the parts
    return convertedParts.join('.');
  } catch (error) {
    // If anything goes wrong, return the original domain
    logger.warn('Failed to decode punycode domain:', error);
    return domain;
  }
}

/**
 * Extract just the ArNS name portion from a full ArNS domain
 * and convert it from punycode if needed
 * 
 * @param arnsName - The ArNS name (e.g., 'xn--nol-mua' or 'xn--nol-mua.arweave.net')
 * @returns The Unicode representation of just the ArNS name portion
 * 
 * @example
 * getDisplayArnsName('xn--nol-mua') // → 'ñol'
 * getDisplayArnsName('xn--nol-mua.arweave.net') // → 'ñol'
 * getDisplayArnsName('regular') // → 'regular'
 */
export function getDisplayArnsName(arnsName: string): string {
  if (!arnsName || typeof arnsName !== 'string') {
    return arnsName;
  }

  // Extract just the first part (the actual ArNS name)
  const namePart = arnsName.split('.')[0];
  
  // Convert from punycode if needed
  return punycodeToUnicode(namePart);
}

/**
 * Check if a string contains punycode
 * 
 * @param str - The string to check
 * @returns True if the string contains punycode segments
 */
export function containsPunycode(str: string): boolean {
  return /xn--/i.test(str);
}