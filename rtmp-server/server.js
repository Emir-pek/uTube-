const NodeMediaServer = require('node-media-server');
require('dotenv').config();

const config = {
    logType: 3,
    bind: '0.0.0.0', // CRITICAL: NMS v4 requires top-level bind for host resolution
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 8080,
        allow_origin: '*',
        api: true
    }
};

const nms = new NodeMediaServer(config);
nms.run();

// --- NMS Event Listeners (Webhooks) ---
// These pings the FastAPI backend to maintain real-time is_live status in the database.

nms.on('prePublish', (session) => {
    // CRITICAL FIX: NMS v4 sends the session object as the first argument.
    // Accessing .split() on an undefined StreamPath causes a fatal crash.
    const stream_key = session.streamName || (session.streamPath ? session.streamPath.split('/').pop() : null);
    console.log(`[NMS] prePublish event for stream: ${stream_key}`);

    if (!stream_key) return;

    const params = new URLSearchParams();
    params.append('name', stream_key);

    fetch('http://127.0.0.1:8000/api/v1/auth/live-auth', {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
        .then(res => {
            if (res.status === 200) {
                console.log(`[AUTH SUCCESS] Stream authorized for ID: ${stream_key}`);
            } else {
                console.warn(`[AUTH REJECTED] Backend rejected stream ${stream_key} with status: ${res.status}`);
            }
        })
        .catch(err => {
            console.error(`[AUTH FATAL] Failed to reach FastAPI at http://127.0.0.1:8000 for stream ${stream_key}:`, err.message);
        });
});

nms.on('donePublish', (session) => {
    const stream_key = session.streamName || (session.streamPath ? session.streamPath.split('/').pop() : null);
    console.log(`[NMS] donePublish event detected for: ${stream_key}`);

    if (!stream_key) return;

    const params = new URLSearchParams();
    params.append('name', stream_key);

    fetch('http://127.0.0.1:8000/api/v1/auth/live-publish-done', {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
        .then(res => {
            console.log(`[OFFLINE] Successfully notified backend that ${stream_key} is done. Status: ${res.status}`);
        })
        .catch(err => {
            console.error(`[OFFLINE ERROR] Failed to notify backend for ${stream_key}:`, err.message);
        });
});
