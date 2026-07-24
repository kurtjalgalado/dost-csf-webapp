const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { DatabaseSync } = require('node:sqlite');

// Load .env variables manually (zero-dependency ponytail principle)
let processEnv = {};
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        processEnv[key] = value.trim();
      }
    });
  }
} catch (e) {
  console.warn('Warning: Could not read .env file:', e.message);
}

const PORT = parseInt(process.env.PORT || processEnv.PORT || '3000', 10);
let GOOGLE_WEBHOOK_URL = process.env.GOOGLE_WEBHOOK_URL || processEnv.GOOGLE_WEBHOOK_URL || '';
let DB_MODE = process.env.DB_MODE || processEnv.DB_MODE || 'dual'; // Modes: 'sqlite', 'apps_script', 'dual'

let GENERATED_BY_NAME = process.env.GENERATED_BY_NAME || processEnv.GENERATED_BY_NAME || 'QMS Officer';
let GENERATED_BY_POS = process.env.GENERATED_BY_POS || processEnv.GENERATED_BY_POS || 'Quality Assurance Team';
let APPROVED_BY_NAME = process.env.APPROVED_BY_NAME || processEnv.APPROVED_BY_NAME || 'Regional Director';
let APPROVED_BY_POS = process.env.APPROVED_BY_POS || processEnv.APPROVED_BY_POS || 'DOST Region V';

let ADMIN_USERNAME = process.env.ADMIN_USERNAME || processEnv.ADMIN_USERNAME || 'dost';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || processEnv.ADMIN_PASSWORD || 'dostregion5';

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'csf_database.sqlite');
const RESPONSES_JSON_FILE = path.join(DATA_DIR, 'responses.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize Native SQLite Database using node:sqlite stdlib
let db = null;
try {
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      date_submitted TEXT,
      service_title TEXT,
      venue TEXT,
      name TEXT,
      institution TEXT,
      ratings_json TEXT,
      importance_json TEXT,
      other_criteria TEXT,
      reason TEXT,
      comments TEXT,
      info_sources_json TEXT,
      preferred_source TEXT,
      signature TEXT
    );
  `);
  console.log(`[SQLite Database] Initialized successfully at: ${DB_PATH}`);
} catch (err) {
  console.error('[SQLite Database Init Error]:', err.message);
}

// JSON file fallback helper
if (!fs.existsSync(RESPONSES_JSON_FILE)) {
  fs.writeFileSync(RESPONSES_JSON_FILE, '[]', 'utf8');
}

function getResponsesFromJson() {
  try {
    const data = fs.readFileSync(RESPONSES_JSON_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function saveResponseToJson(record) {
  try {
    const list = getResponsesFromJson();
    list.unshift(record);
    fs.writeFileSync(RESPONSES_JSON_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to JSON fallback:', err);
  }
}

// Helper to get responses (from SQLite with fallback to JSON)
function getAllResponses() {
  if (db) {
    try {
      const rows = db.prepare('SELECT * FROM responses ORDER BY timestamp DESC').all();
      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        dateSubmitted: row.date_submitted,
        serviceTitle: row.service_title,
        venue: row.venue,
        name: row.name,
        institution: row.institution,
        ratings: JSON.parse(row.ratings_json || '{}'),
        important: JSON.parse(row.importance_json || '{}'),
        otherCriteria: row.other_criteria,
        reason: row.reason,
        comments: row.comments,
        infoSource: JSON.parse(row.info_sources_json || '[]'),
        preferredSource: row.preferred_source,
        signature: row.signature
      }));
    } catch (err) {
      console.error('SQLite query error:', err.message);
    }
  }
  return getResponsesFromJson();
}

// Helper to save response to SQLite
function saveResponseToSqlite(record) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT INTO responses (
        id, timestamp, date_submitted, service_title, venue, name, institution,
        ratings_json, importance_json, other_criteria, reason, comments,
        info_sources_json, preferred_source, signature
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);
    stmt.run(
      record.id,
      record.timestamp,
      record.dateSubmitted || '',
      record.serviceTitle || '',
      record.venue || '',
      record.name || '',
      record.institution || '',
      JSON.stringify(record.ratings || {}),
      JSON.stringify(record.important || {}),
      record.otherCriteria || '',
      record.reason || '',
      record.comments || '',
      JSON.stringify(record.infoSource || []),
      record.preferredSource || '',
      record.signature || ''
    );
    return true;
  } catch (err) {
    console.error('SQLite insert error:', err.message);
    return false;
  }
}

// Helper to forward submission to Google Apps Script
async function forwardToGoogleAppsScript(payload) {
  if (!GOOGLE_WEBHOOK_URL) {
    return { success: false, reason: 'GOOGLE_WEBHOOK_URL not configured' };
  }
  try {
    console.log(`[Google Sync] Forwarding submission #${payload.id} to Google Apps Script...`);
    const response = await fetch(GOOGLE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const resultText = await response.text();
    console.log(`[Google Sync Success]:`, resultText.substring(0, 150));
    return { success: true, response: resultText };
  } catch (err) {
    console.error('[Google Sync Error]:', err.message);
    return { success: false, error: err.message };
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.POSTGRES_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  let supabaseUrl = url;
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const match = url.match(/db\.([a-z0-9]+)\.supabase\.co/);
    if (match && match[1]) {
      supabaseUrl = `https://${match[1]}.supabase.co`;
    }
  }

  if (supabaseUrl && !supabaseUrl.startsWith('http')) {
    supabaseUrl = `https://${supabaseUrl}`;
  }

  return {
    url: supabaseUrl.replace(/\/$/, ''),
    key,
    isConfigured: Boolean(supabaseUrl && key)
  };
}

async function saveToSupabase(feedbackData) {
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return false;

  const payload = {
    id: feedbackData.id || `CSF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    date: feedbackData.date || new Date().toISOString().split('T')[0],
    name: feedbackData.name || '',
    institution: feedbackData.institution || '',
    service_title: feedbackData.serviceTitle || '',
    ratings: feedbackData.ratings || {},
    comments: feedbackData.comments || '',
    signature: feedbackData.signature || '',
    created_at: new Date().toISOString()
  };

  try {
    const res = await fetch(`${url}/rest/v1/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error('Supabase Insert Error:', err.message);
    return false;
  }
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.sqlite': 'application/x-sqlite3'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // --- API Routes ---
  if (pathname === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const feedbackData = JSON.parse(body || '{}');
        const newRecord = {
          id: `CSF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toISOString(),
          dateSubmitted: feedbackData.date || new Date().toISOString().split('T')[0],
          ...feedbackData
        };

        let savedSqlite = false;
        let webhookStatus = null;

        // Mode logic: 'sqlite', 'apps_script', 'dual'
        if (DB_MODE === 'sqlite' || DB_MODE === 'dual') {
          savedSqlite = saveResponseToSqlite(newRecord);
          saveResponseToJson(newRecord); // Backup JSON store
          await saveToSupabase(newRecord); // Supabase (if configured)
        }

        if (DB_MODE === 'apps_script' || DB_MODE === 'dual') {
          if (GOOGLE_WEBHOOK_URL) {
            webhookStatus = await forwardToGoogleAppsScript(newRecord);
          }
        }

        console.log(`[Submission API] ID #${newRecord.id} processed under mode '${DB_MODE}' (SQLite: ${savedSqlite ? 'OK' : 'Skipped/Err'}, Google: ${webhookStatus ? 'Triggered' : 'N/A'})`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Feedback processed successfully in ${DB_MODE} mode.`,
          id: newRecord.id,
          dbMode: DB_MODE,
          sqliteSaved: savedSqlite,
          googleWebhookSynced: Boolean(webhookStatus && webhookStatus.success),
          webhookStatus
        }));
      } catch (err) {
        console.error('Error processing /api/submit:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (pathname === '/api/responses' && req.method === 'GET') {
    const responses = getAllResponses();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: responses.length,
      dbMode: DB_MODE,
      data: responses
    }));
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const username = (payload.username || '').trim();
        const password = (payload.password || '').trim();

        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
          const token = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:dost_secret_session_2026`).toString('base64');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token, username: ADMIN_USERNAME, message: 'Authentication successful' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid username or password' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/auth/verify' && (req.method === 'POST' || req.method === 'GET')) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = payload.token || req.headers['x-admin-token'];
        const expectedToken = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:dost_secret_session_2026`).toString('base64');
        if (token === expectedToken) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, authenticated: true, username: ADMIN_USERNAME }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, authenticated: false }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, authenticated: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    const responses = getAllResponses();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      dbMode: DB_MODE,
      totalResponses: responses.length,
      sqliteActive: Boolean(db),
      googleWebhookConfigured: Boolean(GOOGLE_WEBHOOK_URL),
      googleWebhookUrl: GOOGLE_WEBHOOK_URL ? (GOOGLE_WEBHOOK_URL.substring(0, 30) + '...') : null,
      signOff: {
        generatedByName: GENERATED_BY_NAME,
        generatedByPosition: GENERATED_BY_POS,
        approvedByName: APPROVED_BY_NAME,
        approvedByPosition: APPROVED_BY_POS
      }
    }));
    return;
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const config = JSON.parse(body || '{}');
        if (typeof config.googleWebhookUrl === 'string') {
          GOOGLE_WEBHOOK_URL = config.googleWebhookUrl.trim();
        }
        if (typeof config.dbMode === 'string' && ['sqlite', 'apps_script', 'dual'].includes(config.dbMode)) {
          DB_MODE = config.dbMode;
        }
        if (typeof config.generatedByName === 'string') GENERATED_BY_NAME = config.generatedByName.trim();
        if (typeof config.generatedByPosition === 'string') GENERATED_BY_POS = config.generatedByPosition.trim();
        if (typeof config.approvedByName === 'string') APPROVED_BY_NAME = config.approvedByName.trim();
        if (typeof config.approvedByPosition === 'string') APPROVED_BY_POS = config.approvedByPosition.trim();

        // Save to .env
        try {
          const envContent = `PORT=${PORT}\nGOOGLE_WEBHOOK_URL=${GOOGLE_WEBHOOK_URL}\nDB_MODE=${DB_MODE}\nGENERATED_BY_NAME="${GENERATED_BY_NAME}"\nGENERATED_BY_POS="${GENERATED_BY_POS}"\nAPPROVED_BY_NAME="${APPROVED_BY_NAME}"\nAPPROVED_BY_POS="${APPROVED_BY_POS}"\n`;
          fs.writeFileSync(path.join(__dirname, '.env'), envContent, 'utf8');
        } catch (e) {
          console.warn('Could not save to .env:', e.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          dbMode: DB_MODE,
          googleWebhookConfigured: Boolean(GOOGLE_WEBHOOK_URL),
          signOff: {
            generatedByName: GENERATED_BY_NAME,
            generatedByPosition: GENERATED_BY_POS,
            approvedByName: APPROVED_BY_NAME,
            approvedByPosition: APPROVED_BY_POS
          },
          message: 'Configuration updated successfully'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if ((pathname === '/api/responses/clear' && req.method === 'POST') || (pathname === '/api/responses' && req.method === 'DELETE')) {
    if (db) {
      try {
        db.exec('DELETE FROM responses;');
      } catch (err) {
        console.error('Error clearing SQLite:', err.message);
      }
    }
    try {
      fs.writeFileSync(RESPONSES_JSON_FILE, '[]', 'utf8');
    } catch (err) {
      console.error('Error clearing JSON file:', err.message);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'All database records cleared' }));
    return;
  }

  // --- Static File Handler ---
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  if (reqPath === '/admin') reqPath = '/admin.html';

  let filePath = path.join(__dirname, reqPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end('<h1>404 Not Found</h1><p>The requested file was not found.</p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`
===================================================================
🚀 DOST Region V CSF Server running at: http://localhost:${PORT}
💾 Database Mode:           ${DB_MODE.toUpperCase()} (SQLite node:sqlite stdlib)
📋 Customer Webform:        http://localhost:${PORT}/
📊 Admin & Infographics:    http://localhost:${PORT}/admin.html
🔗 Google Webhook:          ${GOOGLE_WEBHOOK_URL ? 'Configured ✅' : 'Not Configured (Optional) ⚠️'}
===================================================================
  `);
});
