import { md } from '@mtcute/markdown-parser'
import type { MessageContext } from '@mtcute/dispatcher'
import { isAllowed, UNAUTHORIZED_MESSAGE } from '../middleware/auth.js'
import { registerFile, getStreamUrl, getDownloadUrl } from '../../server/utils/file-store.js'
import type { MediaInfo } from '../../types/index.js'

/**
 * Extract media info from a message
 * Returns null if media type is not supported
 */
function extractMediaInfo(msg: any): MediaInfo | null {
    const media = msg.media

    if (!media) return null

    if (media.type === 'video') {
        let fileName: string
        if (media.isRound) {
            fileName = `video_note_${Date.now()}.mp4`
        } else {
            fileName = media.fileName || `video_${Date.now()}.mp4`
        }
        return {
            fileId: media.fileId,
            fileName,
            fileSize: media.fileSize || 0,
            mimeType: media.mimeType || 'video/mp4',
        }
    }

    if (media.type === 'document') {
        return {
            fileId: media.fileId,
            fileName: media.fileName || `document_${Date.now()}`,
            fileSize: media.fileSize || 0,
            mimeType: media.mimeType || 'application/octet-stream',
        }
    }

    if (media.type === 'audio') {
        return {
            fileId: media.fileId,
            fileName: media.fileName || `audio_${Date.now()}.mp3`,
            fileSize: media.fileSize || 0,
            mimeType: media.mimeType || 'audio/mpeg',
        }
    }

    if (media.type === 'voice') {
        return {
            fileId: media.fileId,
            fileName: `voice_${Date.now()}.ogg`,
            fileSize: media.fileSize || 0,
            mimeType: media.mimeType || 'audio/ogg',
        }
    }

    return null
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
    if (bytes <= 0) return ''
    return `📦 Size: ${(bytes / 1024 / 1024).toFixed(2)} MB\n`
}

/**
 * Handle media messages (video, document, audio, voice, video_note)
 */
export async function handleMedia(msg: any): Promise<void> {
    if (!isAllowed(msg.sender.id)) {
        await msg.answerText(UNAUTHORIZED_MESSAGE)
        return
    }
    
    const media = msg.media

    if (!media) {
        await msg.answerText('❌ No media found in this message.')
        return
    }

    // Extract media info
    const mediaInfo = extractMediaInfo(msg)
    
    if (!mediaInfo) {
        await msg.answerText(
            md`ℹ️ Media type \`${media.type}\` is not supported for streaming yet.`
        )
        return
    }

    if (!mediaInfo.fileId) {
        await msg.answerText('❌ Could not get file ID from this media.')
        return
    }

    // Register the file and get streaming token
    const token = registerFile(mediaInfo)

    const streamUrl = getStreamUrl(token)
    const downloadUrl = getDownloadUrl(token)

    // Format response
    const sizeStr = formatSize(mediaInfo.fileSize)

    await msg.answerText(
        md`✅ **File Ready**

📁 Name: \`${mediaInfo.fileName}\`
${sizeStr}🎭 Type: \`${mediaInfo.mimeType}\`

🔗 **Stream URL (VLC/Browser):**
\`${streamUrl}\`

⬇️ **Download URL:**
\`${downloadUrl}\`

📺 For VLC: Media → Open Network Stream`
    )
}
