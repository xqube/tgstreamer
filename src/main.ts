import { Dispatcher, filters } from '@mtcute/dispatcher'
import { TelegramClient } from '@mtcute/node'

import { env } from './config/env.js'
import { botLogger } from './utils/logger.js'
import { startStreamServer } from './server/index.js'
import { handleStart } from './bot/handlers/start.js'
import { handleMedia } from './bot/handlers/media.js'

// Initialize Telegram client
const tg = new TelegramClient({
    apiId: env.API_ID,
    apiHash: env.API_HASH,
    storage: 'bot-data/session',
})

// Handle mtcute client-level errors (connection issues, internal errors)
tg.onError.add((err) => {
    botLogger.error('mtcute client error', { error: err })
})

// Initialize dispatcher
const dp = Dispatcher.for(tg)

// Register handlers
dp.onNewMessage(filters.start, handleStart)
dp.onNewMessage(filters.or(filters.media, filters.roundMessage), handleMedia)

// Graceful shutdown handler
let server: ReturnType<typeof startStreamServer>

const shutdown = async () => {
    botLogger.info('Shutting down gracefully...')
    server?.close()
    process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Start the bot
const user = await tg.start({ botToken: env.BOT_TOKEN })
botLogger.info(`Logged in as @${user.username}`)

// Start streaming server
server = startStreamServer(tg)
