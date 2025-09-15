/**
 * Punycode utilities for converting internationalized domain names (IDN)
 * 
 * Handles conversion of punycode-encoded ArNS names (e.g., xn--) to Unicode
 * for human-readable display while preserving the encoded format for resolution.
 */

import { logger } from './logger';
import { toUnicode } from 'punycode/';

/**
 * Decode punycode using the punycode library
 */
function decodePunycodePart(part: string): string {
  try {
    // Use the imported punycode library to decode
    return toUnicode(part);
  } catch (error) {
    // If decoding fails, return the original
    logger.debug(`Failed to decode punycode part: ${part}`, error);
    return part;
  }
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