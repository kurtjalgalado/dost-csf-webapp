// Vercel Serverless Function to handle Customer Satisfaction Feedback submissions
// Syncs with Supabase Database (if linked/configured) AND Google Apps Script Webhook.

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
  if (!isConfigured) return null;

  const recordId = feedbackData.id || `CSF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const payload = {
    id: recordId,
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

    if (!res.ok) {
      const errText = await res.text();
      console.warn('Supabase Insert Status:', res.status, errText);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Supabase Insert Error:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const feedbackData = req.body || {};
    console.log('Received Feedback Submission:', {
      serviceTitle: feedbackData.serviceTitle,
      date: feedbackData.date,
      name: feedbackData.name,
      institution: feedbackData.institution
    });

    // 1. Save to Supabase (if configured)
    const supabaseResult = await saveToSupabase(feedbackData);

    // 2. Sync to Google Apps Script Webhook (if configured)
    const googleWebhookUrl = process.env.GOOGLE_WEBHOOK_URL;
    let googleResult = null;

    if (googleWebhookUrl) {
      try {
        const webhookResponse = await fetch(googleWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feedbackData)
        });
        googleResult = await webhookResponse.text();
      } catch (err) {
        console.warn('Google Webhook Error:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Feedback submitted successfully',
      supabaseSaved: Boolean(supabaseResult),
      googleSynced: Boolean(googleResult),
      result: googleResult
    });

  } catch (error) {
    console.error('Error handling submission:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process feedback submission',
      error: error.message
    });
  }
}
