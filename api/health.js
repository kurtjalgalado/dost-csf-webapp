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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const googleWebhookUrl = process.env.GOOGLE_WEBHOOK_URL || '';
  const supabase = getSupabaseConfig();

  return res.status(200).json({
    status: 'ok',
    environment: 'vercel',
    dbMode: supabase.isConfigured ? 'supabase' : (process.env.DB_MODE || 'dual'),
    supabaseActive: supabase.isConfigured,
    supabaseUrl: supabase.url ? (supabase.url.substring(0, 25) + '...') : null,
    googleWebhookConfigured: Boolean(googleWebhookUrl),
    googleWebhookUrl: googleWebhookUrl ? (googleWebhookUrl.substring(0, 30) + '...') : null,
    signOff: {
      generatedByName: process.env.GENERATED_BY_NAME || 'QMS Officer',
      generatedByPosition: process.env.GENERATED_BY_POS || 'Quality Assurance Team',
      approvedByName: process.env.APPROVED_BY_NAME || 'Regional Director',
      approvedByPosition: process.env.APPROVED_BY_POS || 'DOST Region V'
    }
  });
}
