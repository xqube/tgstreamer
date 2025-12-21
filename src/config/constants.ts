/**
 * Application constants
 * Extracted magic numbers for better maintainability
 */

// File alignment for Telegram API
export const ALIGN_LARGE_FILE = 1024 * 1024      // 1MB alignment for large files
export const ALIGN_SMALL_FILE = 4 * 1024         // 4KB alignment for small files
export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024  // 10MB threshold

// Download settings
export const PART_SIZE_KB = 1024                 // Download part size in KB (matches ALIGN_LARGE_FILE)

// MIME type mappings
export const MIME_TYPES: Record<string, string> = {
    // Video
    'mp4': 'video/mp4',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'm4v': 'video/x-m4v',
    // Audio
    'mp3': 'audio/mpeg',
    'flac': 'audio/flac',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    // Documents
    'pdf': 'application/pdf',
    'zip': 'application/zip',
    'rar': 'application/vnd.rar',
}

// Default MIME type
export const DEFAULT_MIME_TYPE = 'application/octet-stream'
