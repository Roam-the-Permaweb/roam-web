/**
 * Utility functions for ArNS URL handling
 */

/**
 * Construct a proper ArNS URL from name and gateway
 */
export function constructArNSUrl(name: string, gateway: string): string {
  try {
    const gatewayUrl = new URL(gateway);
    const gatewayHost = gatewayUrl.hostname;
    
    // Check if the gateway already has the ArNS subdomain
    if (gatewayHost.startsWith(`${name}.`)) {
      return gateway;
    }
    
    // Construct the ArNS subdomain URL
    return `https://${name}.${gatewayHost}`;
  } catch {
    // Fallback for invalid gateway URLs
    return `https://${name}.arweave.net`;
  }
}

/**
 * Check if a transaction ID is actually an ArNS URL
 */
export function isArNSUrl(txId: string): boolean {
  // Check if it's an HTTP URL (not ar:// protocol)
  if (!txId.startsWith('http://') && !txId.startsWith('https://')) {
    return false;
  }
  
  try {
    const url = new URL(txId);
    const hostname = url.hostname;
    
    // Check for common ArNS patterns
    // Format: subdomain.gateway.tld where gateway supports ArNS
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      // Check if it matches known ArNS gateway patterns
      const domain = parts.slice(1).join('.');
      return domain.includes('arweave.net') || 
             domain.includes('ar-io.dev') ||
             domain.includes('ar.io') ||
             domain.includes('permaweb.dev') ||
             domain.includes('ardrive.io') ||
             domain.includes('g8way.io');
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract ArNS name from URL
 */
export function extractArNSName(url: string): string | null {
  if (!isArNSUrl(url)) return null;
  
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      return parts[0]; // The ArNS name is the first subdomain
    }
    return null;
  } catch {
    return null;
  }
}