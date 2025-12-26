import 'dotenv/config'
import { z } from 'zod'

// Render provides RENDER_EXTERNAL_URL automatically
// e.g., https://your-app.onrender.com
const PORT = parseInt(process.env.PORT || '8080', 10)
const defaultHost = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`

const r = z.object({
    API_ID: z.coerce.number(),
    API_HASH: z.string(),
    BOT_TOKEN: z.string(),
    HOST: z.string().url().default(defaultHost),
    PORT: z.coerce.number().default(8080),
    MAX_CONCURRENT_STREAMS: z.coerce.number().default(2),  // Per token
    MAX_TOTAL_STREAMS: z.coerce.number().default(4),       // Global limit
    MAX_USERS: z.coerce.number().default(1),               // For reference
    MAX_FILE_ENTRIES: z.coerce.number().default(50),
    // Comma-separated list of allowed Telegram user IDs (empty = allow all)
    ALLOWED_USERS: z.string().default('').transform(val => 
        val ? val.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) : []
    ),
}).safeParse(process.env)

if (!r.success) {
    throw new Error('Invalid env:\n' + z.prettifyError(r.error))
}

export const env = r.data
