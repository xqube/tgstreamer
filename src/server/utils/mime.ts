import { MIME_TYPES, DEFAULT_MIME_TYPE } from '../../config/constants.js'

/**
 * Get MIME type from file extension
 */
export function getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    return MIME_TYPES[ext] || DEFAULT_MIME_TYPE
}
