import winston from 'winston'
import { env } from '../config/env.js'

// Custom format for console output with colors and emojis
const consoleFormat = winston.format.printf(({ level, message, timestamp, context, ...meta }) => {
    const ctx = context ? `[${context}]` : ''
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} ${level} ${ctx} ${message}${metaStr}`
})

// Log level icons for visual identification
const levelIcons: Record<string, string> = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    http: '🌐',
    debug: '🔍',
}

// Custom format that adds icons
const iconFormat = winston.format((info) => {
    const icon = levelIcons[info.level] || ''
    info.level = `${icon} ${info.level.toUpperCase().padEnd(5)}`
    return info
})

// Determine log level from environment
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// Create the logger
const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true })
    ),
    defaultMeta: { service: 'tgflix' },
    transports: [
        // Console transport with colors
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize({ all: false }),
                iconFormat(),
                consoleFormat
            )
        }),
    ],
})

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
    // Error log file
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        )
    }))
    
    // Combined log file
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        )
    }))
}

// Create child loggers for different contexts
export const createLogger = (context: string) => {
    return logger.child({ context })
}

// Pre-configured loggers for main components
export const botLogger = createLogger('Bot')
export const streamLogger = createLogger('Stream')
export const serverLogger = createLogger('Server')

// Export the main logger as default
export default logger
