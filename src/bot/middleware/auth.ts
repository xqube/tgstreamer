import { env } from '../../config/env.js'

/**
 * Check if a Telegram user is allowed to use the bot
 */
export function isAllowed(userId: number): boolean {
    // If no allowed users configured, allow everyone
    if (env.ALLOWED_USERS.length === 0) return true
    return env.ALLOWED_USERS.includes(userId)
}

/**
 * Unauthorized response message
 */
export const UNAUTHORIZED_MESSAGE = '🚫 Sorry, you are not authorized to use this bot.'
