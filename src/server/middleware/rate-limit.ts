import { env } from '../../config/env.js'
import { streamLogger } from '../../utils/logger.js'

/**
 * Track active streams per token for connection limiting
 * VLC needs 2-3 connections: main stream + tail metadata request + seek overlap
 */
const activeStreamsPerToken = new Map<string, number>()

/**
 * Global active stream count
 */
let totalActiveStreams = 0

/**
 * Track active streams per IP for user limiting
 */
const streamsPerIP = new Map<string, number>()

/**
 * Result of rate limit check
 */
interface RateLimitResult {
    allowed: boolean
    reason?: string
}

/**
 * Check if a new stream connection is allowed
 */
export function checkRateLimit(token: string, clientIP: string): RateLimitResult {
    // Check concurrent stream limit per token
    const currentStreams = activeStreamsPerToken.get(token) || 0
    if (currentStreams >= env.MAX_CONCURRENT_STREAMS) {
        streamLogger.warn(`Rejected (per-token): ${currentStreams}/${env.MAX_CONCURRENT_STREAMS}`, { token: token.slice(0, 8) })
        return {
            allowed: false,
            reason: `Per-file limit reached: ${currentStreams}/${env.MAX_CONCURRENT_STREAMS} connections`
        }
    }

    // Check max users limit (by unique IP)
    const ipStreams = streamsPerIP.get(clientIP) || 0
    const activeUsers = streamsPerIP.size
    if (ipStreams === 0 && activeUsers >= env.MAX_USERS) {
        streamLogger.warn(`Rejected (max users): ${activeUsers}/${env.MAX_USERS} users`, { ip: clientIP.slice(-8) })
        return {
            allowed: false,
            reason: `Max users reached: ${activeUsers}/${env.MAX_USERS}`
        }
    }

    // Check global limit
    if (totalActiveStreams >= env.MAX_TOTAL_STREAMS) {
        streamLogger.warn(`Rejected (global): ${totalActiveStreams}/${env.MAX_TOTAL_STREAMS} total streams`)
        return {
            allowed: false,
            reason: `Global limit reached: ${totalActiveStreams}/${env.MAX_TOTAL_STREAMS} streams`
        }
    }

    return { allowed: true }
}

/**
 * Increment stream counters when a stream starts
 */
export function incrementStreamCount(token: string, clientIP: string): void {
    const currentStreams = activeStreamsPerToken.get(token) || 0
    const ipStreams = streamsPerIP.get(clientIP) || 0
    
    activeStreamsPerToken.set(token, currentStreams + 1)
    streamsPerIP.set(clientIP, ipStreams + 1)
    totalActiveStreams++
    
    streamLogger.info(`Started`, { 
        token: token.slice(0, 8), 
        perToken: `${currentStreams + 1}/${env.MAX_CONCURRENT_STREAMS}`, 
        users: `${streamsPerIP.size}/${env.MAX_USERS}`, 
        total: `${totalActiveStreams}/${env.MAX_TOTAL_STREAMS}` 
    })
}

/**
 * Decrement stream counters when a stream ends
 */
export function decrementStreamCount(token: string, clientIP: string): void {
    const count = activeStreamsPerToken.get(token) || 1
    if (count <= 1) {
        activeStreamsPerToken.delete(token)
    } else {
        activeStreamsPerToken.set(token, count - 1)
    }
    
    const ipCount = streamsPerIP.get(clientIP) || 1
    if (ipCount <= 1) {
        streamsPerIP.delete(clientIP)
    } else {
        streamsPerIP.set(clientIP, ipCount - 1)
    }
    
    totalActiveStreams = Math.max(0, totalActiveStreams - 1)
    
    streamLogger.info(`Ended`, { 
        token: token.slice(0, 8), 
        perToken: `${Math.max(0, count - 1)}/${env.MAX_CONCURRENT_STREAMS}`, 
        users: `${streamsPerIP.size}/${env.MAX_USERS}`, 
        total: `${totalActiveStreams}/${env.MAX_TOTAL_STREAMS}` 
    })
}

/**
 * Get stats for monitoring
 */
export function getStats() {
    return {
        totalActiveStreams,
        activeTokens: activeStreamsPerToken.size,
        activeUsers: streamsPerIP.size,
    }
}
