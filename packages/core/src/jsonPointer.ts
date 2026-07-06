/**
 * Pure RFC 6901 JSON Pointer helpers shared by core ($ref resolution) and
 * validation adapters (AJV `instancePath` → tree dot-path).
 *
 * Path convention (ADR 018): objects use `.`, array indices are numeric
 * segments, root is `''` — e.g. `contacts.0.email`.
 */

/** Unescape one JSON Pointer segment (`~1` → `/`, `~0` → `~`; order matters). */
export function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

/**
 * RFC 6901 JSON Pointer (`/contacts/0/email`) → tree dot-path (`contacts.0.email`).
 * Root pointer `''` → root path `''`.
 */
export function jsonPointerToPath(pointer: string): string {
  if (!pointer) return ''
  return pointer.slice(1).split('/').map(decodeJsonPointerSegment).join('.')
}

/** Append a segment to a dot-path; empty base returns the segment alone. */
export function joinPath(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment
}
