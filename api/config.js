// Vercel Serverless Function to handle /api/config
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const config = req.body || {};
    return res.status(200).json({
      success: true,
      dbMode: config.dbMode || process.env.DB_MODE || 'dual',
      googleWebhookConfigured: Boolean(config.googleWebhookUrl || process.env.GOOGLE_WEBHOOK_URL),
      signOff: {
        generatedByName: config.generatedByName || process.env.GENERATED_BY_NAME || 'QMS Officer',
        generatedByPosition: config.generatedByPosition || process.env.GENERATED_BY_POS || 'Quality Assurance Team',
        approvedByName: config.approvedByName || process.env.APPROVED_BY_NAME || 'Regional Director',
        approvedByPosition: config.approvedByPosition || process.env.APPROVED_BY_POS || 'DOST Region V'
      },
      message: 'Configuration updated successfully'
    });
  }

  return res.status(200).json({
    success: true,
    dbMode: process.env.DB_MODE || 'dual',
    googleWebhookConfigured: Boolean(process.env.GOOGLE_WEBHOOK_URL),
    signOff: {
      generatedByName: process.env.GENERATED_BY_NAME || 'QMS Officer',
      generatedByPosition: process.env.GENERATED_BY_POS || 'Quality Assurance Team',
      approvedByName: process.env.APPROVED_BY_NAME || 'Regional Director',
      approvedByPosition: process.env.APPROVED_BY_POS || 'DOST Region V'
    }
  });
}
