import { env } from '../../config/env.js'
import type { FileEntry } from '../../types/index.js'

/**
 * File metadata store with LRU eviction
 * Only stores metadata (~100 bytes per entry), not file content
 */
const fileStore = new Map<string, FileEntry>()

/**
 * Generate a unique token for a file
 */
export function generateToken(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15)
}

/**
 * Register a file for streaming (with LRU eviction)
 */
export function registerFile(entry: FileEntry): string {
    // Evict oldest entries if at limit
    if (fileStore.size >= env.MAX_FILE_ENTRIES) {
        const oldestKey = fileStore.keys().next().value
        if (oldestKey) fileStore.delete(oldestKey)
    }
    
    const token = generateToken()
    fileStore.set(token, entry)
    return token
}

/**
 * Get file entry by token
 */
export function getFileEntry(token: string): FileEntry | undefined {
    return fileStore.get(token)
}

/**
 * Get the streaming URL for a token
 */
export function getStreamUrl(token: string): string {
    return `${env.HOST}/stream/${token}`
}

/**
 * Get the download URL for a token
 */
export function getDownloadUrl(token: string): string {
    return `${env.HOST}/download/${token}`
}
