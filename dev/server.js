/**
 * DramaPocket - Zero-Dependency Local Development Server
 * Project: DramaPocket (Android WebView Asian Drama App)
 *
 * Requirements:
 * - Uses ONLY Node.js built-in modules (http, https, fs, path, url).
 * - Zero npm dependencies, zero Docker, zero external frameworks.
 * - Serves static files from app/src/main/assets/www/ on port 5500.
 * - Dynamically injects dev-bridge.js on index.html requests (disk remains 100% clean).
 * - Implements secure HTTPS proxy (/__dev/fetch) allowlisted to NartoDrama domains with cookie jar.
 * - Supports HTTP 206 partial content range requests for smooth video playback.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const DEFAULT_PORT = 5500;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
const HOST = process.env.HOST || '0.0.0.0';

const WWW_ROOT = path.resolve(__dirname, '../app/src/main/assets/www');
const DEV_BRIDGE_PATH = path.resolve(__dirname, 'dev-bridge.js');

// Allowed hosts for the development proxy
const ALLOWED_HOST_SUFFIXES = [
  'nartodrama.com',
  'narto-drama.com',
  'nartodrama-api.online'
];

// In-memory cookie jar for upstream requests
const cookieJar = new Map();

// Initialize default nd_ck cookie if empty
function ensureDefaultCookies() {
  if (!cookieJar.has('nd_ck')) {
    const defaultNdCk = Date.now().toString(36) + 'dramapocket' + Math.random().toString(36).slice(2, 8);
    cookieJar.set('nd_ck', defaultNdCk);
  }
}

// Format cookies into standard Cookie header string
function getFormattedCookieHeader() {
  ensureDefaultCookies();
  const pairs = [];
  for (const [key, val] of cookieJar.entries()) {
    pairs.push(`${key}=${val}`);
  }
  return pairs.join('; ');
}

// Ingest Set-Cookie header(s) from upstream responses
function ingestSetCookies(headers) {
  if (!headers) return;
  const setCookie = headers['set-cookie'];
  if (!setCookie) return;

  const rawHeaders = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const raw of rawHeaders) {
    if (!raw) continue;
    const parts = String(raw).split(';');
    if (parts.length > 0) {
      const first = parts[0].trim();
      const eqIdx = first.indexOf('=');
      if (eqIdx > 0) {
        const key = first.substring(0, eqIdx).trim();
        const val = first.substring(eqIdx + 1).trim();
        if (key) {
          cookieJar.set(key, val);
        }
      }
    }
  }
}

// Validate whether a hostname is strictly permitted
function isAllowlistedHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const lower = hostname.toLowerCase().trim();
  for (const base of ALLOWED_HOST_SUFFIXES) {
    if (lower === base || lower.endsWith('.' + base)) {
      return true;
    }
  }
  return false;
}

// Accurate MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Handle Upstream Proxy Request (/__dev/fetch?url=...)
 */
function handleProxyFetch(req, res, targetUrlStr) {
  if (!targetUrlStr) {
    res.writeHead(400, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ok: false, status: 400, error: 'Query parameter "url" is required' }));
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrlStr);
  } catch (err) {
    res.writeHead(400, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ok: false, status: 400, error: 'Invalid URL format: ' + err.message }));
    return;
  }

  // Enforce HTTPS
  if (parsedUrl.protocol !== 'https:') {
    res.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ok: false, status: 403, error: 'Only HTTPS protocol is permitted' }));
    return;
  }

  // Enforce Host Allowlist
  if (!isAllowlistedHost(parsedUrl.hostname)) {
    res.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: false,
      status: 403,
      error: `Host restricted to NartoDrama allowlist: ${parsedUrl.hostname}`
    }));
    return;
  }

  // Recursive upstream request function to safely handle redirects
  let redirectCount = 0;
  const MAX_REDIRECTS = 5;

  function doUpstreamRequest(currentUrl) {
    const cookieHeader = getFormattedCookieHeader();

    const options = {
      protocol: currentUrl.protocol,
      hostname: currentUrl.hostname,
      port: currentUrl.port || 443,
      path: currentUrl.pathname + currentUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 DramaPocket/1.0-dev',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cookie': cookieHeader
      },
      timeout: 10000
    };

    const upstreamReq = https.request(options, (upstreamRes) => {
      // Ingest response cookies
      ingestSetCookies(upstreamRes.headers);

      const statusCode = upstreamRes.statusCode || 200;

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if (statusCode >= 300 && statusCode < 400 && upstreamRes.headers.location) {
        if (redirectCount >= MAX_REDIRECTS) {
          res.writeHead(502, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          res.end(JSON.stringify({ ok: false, status: 502, error: 'Too many redirects' }));
          return;
        }

        redirectCount++;
        try {
          const redirectUrl = new URL(upstreamRes.headers.location, currentUrl);
          if (redirectUrl.protocol !== 'https:' || !isAllowlistedHost(redirectUrl.hostname)) {
            res.writeHead(403, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store'
            });
            res.end(JSON.stringify({
              ok: false,
              status: 403,
              error: `Redirected to untrusted external host: ${redirectUrl.hostname}`
            }));
            return;
          }
          // Drain upstream stream
          upstreamRes.resume();
          doUpstreamRequest(redirectUrl);
          return;
        } catch (e) {
          res.writeHead(502, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          res.end(JSON.stringify({ ok: false, status: 502, error: 'Malformed redirect URL: ' + e.message }));
          return;
        }
      }

      // Collect upstream response body
      const chunks = [];
      let totalBytes = 0;
      const MAX_BYTES = 4 * 1024 * 1024; // 4 MB safety limit

      upstreamRes.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes <= MAX_BYTES) {
          chunks.push(chunk);
        }
      });

      upstreamRes.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const bodyText = bodyBuffer.toString('utf-8');

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        });

        res.end(JSON.stringify({
          ok: statusCode >= 200 && statusCode < 400,
          status: statusCode,
          body: bodyText,
          finalUrl: currentUrl.toString()
        }));
      });
    });

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy();
      res.writeHead(504, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ ok: false, status: 504, error: 'Upstream gateway request timed out (10s)' }));
    });

    upstreamReq.on('error', (err) => {
      res.writeHead(502, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ ok: false, status: 502, error: 'Upstream connection error: ' + err.message }));
    });

    upstreamReq.end();
  }

  doUpstreamRequest(parsedUrl);
}

/**
 * Handle Serving dev-bridge.js (/__dev/dev-bridge.js)
 */
function handleDevBridge(req, res) {
  fs.readFile(DEV_BRIDGE_PATH, 'utf-8', (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error loading dev-bridge.js: ' + err.message);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  });
}

/**
 * Handle Health / Status Endpoint (/__dev/status)
 */
function handleStatus(req, res) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({
    status: 'running',
    port: PORT,
    root: 'app/src/main/assets/www',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    proxyAllowlist: ALLOWED_HOST_SUFFIXES,
    cookiesStored: cookieJar.size
  }, null, 2));
}

/**
 * Handle HTML Page Serving with Dynamic Dev-Bridge Injection
 */
function handleHtmlServing(filePath, res) {
  fs.readFile(filePath, 'utf-8', (err, html) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error: ' + err.message);
      return;
    }

    // Dynamic injection: Inject <script src="/__dev/dev-bridge.js"></script>
    // right before <script src="js/storage.js"></script>
    let injectedHtml = html;
    const targetScriptTag = '<script src="js/storage.js"></script>';
    const devScriptTag = '<!-- DramaPocket Dev Simulator Injection -->\n  <script src="/__dev/dev-bridge.js"></script>\n  ';

    if (injectedHtml.includes(targetScriptTag) && !injectedHtml.includes('/__dev/dev-bridge.js')) {
      injectedHtml = injectedHtml.replace(targetScriptTag, devScriptTag + targetScriptTag);
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(injectedHtml);
  });
}

/**
 * Handle Static File Serving with HTTP 206 Partial Content Support
 */
function handleStaticFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + path.basename(filePath));
      return;
    }

    const mimeType = getMimeType(filePath);
    const fileSize = stats.size;
    const range = req.headers.range;

    // Support HTTP Range requests for video/audio streaming
    if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, {
          'Content-Range': `bytes */${fileSize}`,
          'Content-Type': 'text/plain'
        });
        res.end('Requested Range Not Satisfiable');
        return;
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });

      fileStream.pipe(res);
      return;
    }

    // Standard static response
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

/**
 * Create Master Request Dispatcher
 */
function requestHandler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:5500'}`);
  const pathname = reqUrl.pathname;

  // 1. Dev Proxy: /__dev/fetch?url=...
  if (pathname === '/__dev/fetch') {
    const targetUrl = reqUrl.searchParams.get('url');
    handleProxyFetch(req, res, targetUrl);
    return;
  }

  // 2. Dev Bridge Script: /__dev/dev-bridge.js
  if (pathname === '/__dev/dev-bridge.js') {
    handleDevBridge(req, res);
    return;
  }

  // 3. Status Endpoint: /__dev/status
  if (pathname === '/__dev/status') {
    handleStatus(req, res);
    return;
  }

  // 4. Root / index.html with Dynamic Script Injection
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(WWW_ROOT, 'index.html');
    handleHtmlServing(indexPath, res);
    return;
  }

  // 5. Static Assets from app/src/main/assets/www
  // Prevent directory traversal attacks
  let safeRelativePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safeRelativePath.startsWith('/') || safeRelativePath.startsWith('\\')) {
    safeRelativePath = safeRelativePath.substring(1);
  }

  const resolvedFilePath = path.resolve(WWW_ROOT, safeRelativePath);
  if (!resolvedFilePath.startsWith(WWW_ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Directory traversal attempt detected');
    return;
  }

  // Check if file is an HTML file for dynamic injection, else normal static file
  if (path.extname(resolvedFilePath).toLowerCase() === '.html') {
    handleHtmlServing(resolvedFilePath, res);
  } else {
    handleStaticFile(req, res, resolvedFilePath);
  }
}

/**
 * Server Factory & Lifecycle
 */
function createDevServer() {
  return http.createServer(requestHandler);
}

function startServer(port = PORT, host = HOST) {
  const server = createDevServer();
  server.listen(port, host, () => {
    console.log('================================================================');
    console.log('      DramaPocket Zero-Dependency Development Server');
    console.log('================================================================');
    console.log(`  Local URL      : http://localhost:${port}/`);
    console.log(`  Network URL    : http://${host}:${port}/`);
    console.log(`  Static Root    : ${WWW_ROOT}`);
    console.log(`  Dev Bridge     : http://localhost:${port}/__dev/dev-bridge.js`);
    console.log(`  Status API     : http://localhost:${port}/__dev/status`);
    console.log(`  Secure Proxy   : http://localhost:${port}/__dev/fetch?url=...`);
    console.log('----------------------------------------------------------------');
    console.log('  Mode           : Zero npm dependencies (Node.js built-ins)');
    console.log('  Injection      : Dynamic in-memory dev-bridge.js (assets clean)');
    console.log('  CORS Policy    : Bypass via server proxy with NartoDrama jar');
    console.log('================================================================');
    console.log('  Press Ctrl+C to stop the development server.\n');
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createDevServer,
  startServer,
  isAllowlistedHost,
  PORT,
  WWW_ROOT
};
