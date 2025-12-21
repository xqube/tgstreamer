import http from 'node:http'
import { Writable } from 'node:stream'
import type { TelegramClient } from '@mtcute/node'

import { env } from '../config/env.js'
import { ALIGN_LARGE_FILE, ALIGN_SMALL_FILE, LARGE_FILE_THRESHOLD, PART_SIZE_KB } from '../config/constants.js'
import { streamLogger } from '../utils/logger.js'
import { getFileEntry } from './utils/file-store.js'
import { getMimeType } from './utils/mime.js'
import { checkRateLimit, incrementStreamCount, decrementStreamCount } from './middleware/rate-limit.js'

/**
 * Send error message to browser (plain text)
 */
function sendErrorMessage(res: http.ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' })
    res.end(message)
}

/**
 * Get client IP from request
 */
function getClientIP(req: http.IncomingMessage): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
        || req.socket.remoteAddress 
        || 'unknown'
}

/**
 * Handle streaming/download request
 */
async function handleStreamRequest(
    req: http.IncomingMessage, 
    res: http.ServerResponse,
    tg: TelegramClient,
    token: string,
    isDownload: boolean
): Promise<void> {
    const fileEntry = getFileEntry(token)

    if (!fileEntry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('File not found or link expired')
        return
    }

    const clientIP = getClientIP(req)

    // Check rate limits
    const rateLimit = checkRateLimit(token, clientIP)
    if (!rateLimit.allowed) {
        sendErrorMessage(res, 503, rateLimit.reason!)
        return
    }

    // Increment active stream counts
    incrementStreamCount(token, clientIP)

    try {
        const { fileId, fileName, fileSize, mimeType } = fileEntry
        const contentType = mimeType || getMimeType(fileName)

        // Parse Range header
        const rangeHeader = req.headers.range
        let start = 0
        let end = fileSize - 1

        if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
            if (match) {
                start = match[1] ? parseInt(match[1], 10) : 0
                end = match[2] ? parseInt(match[2], 10) : fileSize - 1
            }
        }

        const chunkSize = end - start + 1
        streamLogger.http(`${fileName}`, { bytes: `${start}-${end}` })

        // Headers
        const disposition = isDownload ? 'attachment' : 'inline'
        const headers: Record<string, string | number> = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Disposition': `${disposition}; filename="${encodeURIComponent(fileName)}"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        }

        if (rangeHeader) {
            headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
            res.writeHead(206, headers)
        } else {
            res.writeHead(200, headers)
        }

        // Flush headers immediately to prevent buffering delays
        res.flushHeaders()

        // Handle HEAD request - return headers only, no body
        if (req.method === 'HEAD') {
            decrementStreamCount(token, clientIP)
            res.end()
            return
        }

        // Alignment for Telegram API
        const isLargeFile = fileSize > LARGE_FILE_THRESHOLD
        const ALIGN = isLargeFile ? ALIGN_LARGE_FILE : ALIGN_SMALL_FILE
        const alignedStart = Math.floor(start / ALIGN) * ALIGN
        const skipBytes = start - alignedStart

        // Abort controller for cleanup
        const abortController = new AbortController()
        let cleanedUp = false
        let bytesStreamed = 0
        let skipped = 0
        let written = 0

        // Stall timeout - kill connection if client stops reading but doesn't disconnect
        let stallTimeout: ReturnType<typeof setTimeout> | null = null

        // Cleanup function
        const cleanup = (reason: string) => {
            if (cleanedUp) return
            cleanedUp = true
            if (stallTimeout) clearTimeout(stallTimeout)
            decrementStreamCount(token, clientIP)
            abortController.abort()
            const mem = process.memoryUsage()
            streamLogger.debug(`Cleanup: ${reason}`, { 
                bytesStreamed,
                heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
                rssMB: Math.round(mem.rss / 1024 / 1024)
            })
        }

        req.on('close', () => cleanup('client disconnect'))

        // Get the Web ReadableStream from mtcute
        const webStream = tg.downloadAsStream(fileId, {
            offset: alignedStart,
            fileSize: fileSize,
            partSize: PART_SIZE_KB,
            abortSignal: abortController.signal,
            highWaterMark: env.MTCUTE_HIGH_WATER_MARK,  // undefined = mtcute default
        })

        // Create a Web TransformStream for slicing (skip + limit)
        const sliceTransform = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                bytesStreamed += chunk.length
                
                // Skip alignment bytes
                if (skipped < skipBytes) {
                    const toSkip = Math.min(skipBytes - skipped, chunk.length)
                    skipped += toSkip
                    chunk = chunk.subarray(toSkip)
                    if (chunk.length === 0) return
                }
                
                // Limit to requested size
                const remaining = chunkSize - written
                if (remaining <= 0) {
                    controller.terminate()
                    return
                }
                
                if (chunk.length > remaining) {
                    chunk = chunk.subarray(0, remaining)
                }
                
                written += chunk.length
                controller.enqueue(chunk)
                
                if (written >= chunkSize) {
                    controller.terminate()
                }
            }
        })

        // Pipe: Web ReadableStream -> TransformStream -> Response (as Web WritableStream)
        // Note: HTTP response buffer is managed by Node.js internally, not configurable via toWeb()
        const webWritable = Writable.toWeb(res as any)
        
        // Set stall timeout - 2 minutes of no progress triggers cleanup
        stallTimeout = setTimeout(() => {
            if (!cleanedUp && written < chunkSize) {
                cleanup('stall timeout')
                res.destroy()
            }
        }, 120000)

        webStream
            .pipeThrough(sliceTransform)
            .pipeTo(webWritable, { signal: abortController.signal })
            .then(() => cleanup('stream complete'))
            .catch((err) => {
                if (!abortController.signal.aborted) {
                    streamLogger.warn('Stream error', { error: err.message, bytesStreamed })
                }
                cleanup('stream error')
            })

    } catch (error) {
        // Decrement counters on error
        decrementStreamCount(token, clientIP)
        streamLogger.error('Streaming error', { error })
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
        }
        res.end('Failed to stream file')
    }
}

/**
 * Start the HTTP streaming server
 */
export function startStreamServer(tg: TelegramClient): http.Server {
    
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`)
        const pathParts = url.pathname.split('/').filter(Boolean)

        // Health check endpoint
        if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('OK')
            return
        }

        // Stream endpoint: /stream/:token
        // Download endpoint: /download/:token
        if ((pathParts[0] === 'stream' || pathParts[0] === 'download') && pathParts[1]) {
            const isDownload = pathParts[0] === 'download'
            const token = pathParts[1]
            await handleStreamRequest(req, res, tg, token, isDownload)
            return
        }

        // 404 for unknown routes
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
    })

    // HTTP server timeouts for connection management
    server.setTimeout(300000)        // 5 min overall request timeout
    server.keepAliveTimeout = 60000  // 60s keep-alive timeout
    server.headersTimeout = 30000    // 30s to receive request headers

    server.listen(env.PORT, '0.0.0.0', () => {
        streamLogger.info(`Server listening on 0.0.0.0:${env.PORT}`)
        streamLogger.info(`Public URL: ${env.HOST}`)
    })

    return server
}
