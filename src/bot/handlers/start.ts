import { md } from '@mtcute/markdown-parser'
import type { MessageContext } from '@mtcute/dispatcher'
import { isAllowed, UNAUTHORIZED_MESSAGE } from '../middleware/auth.js'

/**
 * Handle /start command
 */
export async function handleStart(msg: MessageContext): Promise<void> {
    if (!isAllowed(msg.sender.id)) {
        await msg.answerText(UNAUTHORIZED_MESSAGE)
        return
    }
    
    await msg.answerText(
        md`🎬 **TgFlix - Stream Bot**

Send me any video, audio, or document file and I'll give you a streaming link!

📺 Open the link in VLC or any media player to stream.`
    )
}
