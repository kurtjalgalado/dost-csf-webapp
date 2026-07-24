export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'dost';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dostregion5';
  const expectedToken = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:dost_secret_session_2026`).toString('base64');

  const body = req.body || {};
  const token = body.token || req.headers['x-admin-token'];
  const isVerify = req.url.includes('verify');

  if (isVerify || (token && !req.url.includes('login'))) {
    if (token === expectedToken) {
      return res.status(200).json({ success: true, authenticated: true, username: ADMIN_USERNAME });
    }
    return res.status(401).json({ success: false, authenticated: false, error: 'Invalid session token' });
  }

  // Login handler
  const { username, password } = body;
  if ((username || '').trim() === ADMIN_USERNAME && (password || '').trim() === ADMIN_PASSWORD) {
    return res.status(200).json({
      success: true,
      token: expectedToken,
      username: ADMIN_USERNAME,
      message: 'Authentication successful'
    });
  }

  return res.status(401).json({ success: false, error: 'Invalid username or password' });
}
