// Vercel Serverless Function to fetch / clear customer responses from Supabase.

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

async function getResponsesFromSupabase() {
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  try {
    const res = await fetch(`${url}/rest/v1/responses?select=*&order=created_at.desc`, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (!res.ok) {
      console.warn('Supabase Fetch Status:', res.status);
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data)) return null;

    return data.map(item => ({
      id: item.id,
      date: item.date,
      name: item.name,
      institution: item.institution,
      serviceTitle: item.service_title || item.serviceTitle,
      ratings: typeof item.ratings === 'string' ? JSON.parse(item.ratings) : (item.ratings || {}),
      comments: item.comments,
      signature: item.signature
    }));
  } catch (err) {
    console.error('Supabase Fetch Error:', err.message);
    return null;
  }
}

async function clearSupabaseResponses() {
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return false;

  try {
    const res = await fetch(`${url}/rest/v1/responses?id=neq.NULL`, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    return res.ok;
  } catch (err) {
    console.error('Supabase Clear Error:', err.message);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'DELETE' || req.url.includes('clear')) {
    await clearSupabaseResponses();
    return res.status(200).json({ success: true, message: 'All responses cleared' });
  }

  const supabaseData = await getResponsesFromSupabase();

  if (supabaseData !== null) {
    return res.status(200).json({
      success: true,
      count: supabaseData.length,
      dbMode: 'supabase',
      environment: 'vercel',
      data: supabaseData
    });
  }

  return res.status(200).json({
    success: true,
    count: 0,
    dbMode: 'ephemeral',
    environment: 'vercel',
    data: [],
    message: 'Running on Vercel Serverless environment. Submissions are synced to Google Docs via Google Apps Script & saved when Supabase is linked.'
  });
}
