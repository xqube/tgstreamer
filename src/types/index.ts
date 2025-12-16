/**
 * Shared type definitions for TgFlix
 */

/**
 * File entry stored for streaming
 */
export interface FileEntry {
    fileId: string
    fileName: string
    fileSize: number
    mimeType: string
}

/**
 * Supported media types for streaming
 */
export type SupportedMediaType = 'video' | 'document' | 'audio' | 'voice'

/**
 * Extracted media info from a Telegram message
 */
export interface MediaInfo {
    fileId: string
    fileName: string
    fileSize: number
    mimeType: string
}
