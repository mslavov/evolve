/**
 * Utility for extracting values from objects using simple path notation
 * Supports dot notation for nested fields (e.g., "score", "result.value", "data.metrics.score")
 */

/**
 * Extract a value from an object using dot notation path
 * @param data The object to extract from
 * @param path The dot notation path (e.g., "score", "result.value")
 * @returns The value at the path, or undefined if not found
 */
export function extractValueByPath(data: any, path?: string): any {
  // If no path specified, return the entire data
  if (!path || path === '$' || path === '.') {
    return data;
  }
  
  // Handle null or undefined data
  if (data == null) {
    return undefined;
  }
  
  // Split path by dots and traverse the object
  const parts = path.split('.');
  let current = data;
  
  for (const part of parts) {
    // Handle array index notation if needed in future (e.g., "items[0]")
    // For now, just handle simple property access
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Check if a value is numeric (number or numeric string)
 * @param value The value to check
 * @returns true if the value can be treated as a number
 */
export function isNumericValue(value: any): boolean {
  if (typeof value === 'number') {
    return !isNaN(value) && isFinite(value);
  }
  
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return !isNaN(num) && isFinite(num);
  }
  
  return false;
}

/**
 * Parse a value as a number, handling various formats
 * @param value The value to parse
 * @returns The parsed number, or NaN if not parseable
 */
export function parseAsNumber(value: any): number {
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    return parseFloat(value);
  }
  
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  
  if (value instanceof Date) {
    return value.getTime();
  }
  
  return NaN;
}