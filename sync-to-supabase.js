// Script to sync local SQLite database records to Vercel linked Supabase Database
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Load environment variables from .env.prod or .env
function loadEnv() {
  const envFiles = ['.env.prod', '.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const parts = trimmed.split('=');
          const key = parts[0].trim();
          let value = parts.slice(1).join('=').trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          if (!process.env[key]) process.env[key] = value;
        }
      });
    }
  }
}

loadEnv();

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

function getLocalResponses() {
  const dbPath = path.join(__dirname, 'data', 'csf_database.sqlite');
  const jsonPath = path.join(__dirname, 'data', 'responses.json');
  let records = [];

  if (fs.existsSync(dbPath)) {
    try {
      const db = new DatabaseSync(dbPath);
      const rows = db.prepare('SELECT * FROM responses;').all();
      records = rows.map(r => ({
        id: r.id,
        date: r.date,
        name: r.name,
        institution: r.institution,
        serviceTitle: r.service_title,
        ratings: typeof r.ratings === 'string' ? JSON.parse(r.ratings) : r.ratings,
        comments: r.comments,
        signature: r.signature,
        created_at: r.created_at
      }));
    } catch (e) {
      console.warn('SQLite read warning:', e.message);
    }
  }

  if (records.length === 0 && fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      records = JSON.parse(raw || '[]');
    } catch (e) {
      console.warn('JSON read warning:', e.message);
    }
  }

  return records;
}

async function syncToSupabase() {
  const supabase = getSupabaseConfig();
  console.log('===================================================================');
  console.log('  DOST Region V CSF - Local Database -> Supabase Sync Utility');
  console.log('===================================================================');
  console.log('Supabase Configured:', supabase.isConfigured ? 'YES' : 'NO');
  if (supabase.url) console.log('Supabase Target URL:', supabase.url);
  console.log('');

  if (!supabase.isConfigured) {
    console.error('[ERROR] Supabase credentials not found in environment!');
    process.exit(1);
  }

  const localRecords = getLocalResponses();
  console.log(`Found ${localRecords.length} local response record(s) to sync.`);

  if (localRecords.length === 0) {
    console.log('No local records to sync. SQLite database is empty.');
    return;
  }

  let successCount = 0;
  for (const record of localRecords) {
    const payload = {
      id: record.id || `CSF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: record.dateSubmitted || record.date || new Date().toISOString().split('T')[0],
      name: record.name || '',
      institution: record.institution || '',
      service_title: record.serviceTitle || '',
      ratings: record.ratings || {},
      comments: record.comments || '',
      signature: record.signature || '',
      created_at: record.created_at || record.timestamp || new Date().toISOString()
    };

    try {
      const res = await fetch(`${supabase.url}/rest/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabase.key,
          'Authorization': `Bearer ${supabase.key}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok || res.status === 409) {
        console.log(`  ✓ Synced Record ID #${payload.id} (${payload.name} - ${payload.service_title})`);
        successCount++;
      } else {
        const errText = await res.text();
        console.warn(`  ✗ Failed Record ID #${payload.id}: HTTP ${res.status} - ${errText}`);
      }
    } catch (err) {
      console.error(`  ✗ Error pushing Record ID #${payload.id}:`, err.message);
    }
  }

  console.log('');
  console.log(`Successfully synced ${successCount} / ${localRecords.length} record(s) to Supabase!`);
}

syncToSupabase().catch(console.error);
