import fs from 'node:fs'
import path from 'node:path'
import { env } from '../../config/env.js'
import type { FileEntry } from '../../types/index.js'

/**
 * Persistent file store using JSON file
 * Survives PM2 restarts when memory limit is reached
 */

const STORE_FILE = path.join(process.cwd(), 'bot-data', 'file-store.json')

interface StoreData {
    entries: Record<string, FileEntry>  // token -> FileEntry
    order: string[]  // For LRU eviction (oldest first)
}

// In-memory cache (loaded from file on startup)
let store: StoreData = { entries: {}, order: [] }

/**
 * Load store from disk
 */
function loadStore(): void {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const data = fs.readFileSync(STORE_FILE, 'utf8')
            store = JSON.parse(data)
            console.log(`[FileStore] Loaded ${store.order.length} entries from disk`)
        }
    } catch (error) {
        console.warn('[FileStore] Failed to load store, starting fresh:', error)
        store = { entries: {}, order: [] }
    }
}

/**
 * Save store to disk (debounced to avoid excessive writes)
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null

function saveStore(): void {
    // Debounce: wait 1s before writing to disk
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
        try {
            // Ensure directory exists
            const dir = path.dirname(STORE_FILE)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }
            fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2))
        } catch (error) {
            console.error('[FileStore] Failed to save store:', error)
        }
    }, 1000)
}

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
    while (store.order.length >= env.MAX_FILE_ENTRIES) {
        const oldestToken = store.order.shift()
        if (oldestToken) {
            delete store.entries[oldestToken]
        }
    }
    
    const token = generateToken()
    store.entries[token] = entry
    store.order.push(token)
    
    saveStore()
    return token
}

/**
 * Get file entry by token
 */
export function getFileEntry(token: string): FileEntry | undefined {
    return store.entries[token]
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

/**
 * Get store stats for debugging
 */
export function getStoreStats() {
    return {
        count: store.order.length,
        maxEntries: env.MAX_FILE_ENTRIES,
    }
}

// Load store on module initialization
loadStore()
