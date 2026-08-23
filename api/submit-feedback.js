/**
 * Vercel Serverless Function — Submit Feedback to Google Form
 *
 * POST /api/submit-feedback
 * Body (JSON):
 *   {
 *     "fullName":    string (required),
 *     "whatsapp":   string (optional — at least one contact required),
 *     "email":      string (optional — at least one contact required),
 *     "category":   string (required),
 *     "description": string (required),
 *     "steps":      string (optional)
 *   }
 *
 * Google Form: https://docs.google.com/forms/d/1M9YI4smtBaFYUWYb8GEHuIa2ZSleWdtVYwRGotDfrhQ/
 */

const ENTRY_IDS = {
  fullName:    'entry.438200863',
  whatsapp:    'entry.1087852213',
  email:       'entry.647364240',
  category:    'entry.1265271650',
  description: 'entry.754980109',
  steps:       'entry.1109056012',
};

const VALID_CATEGORIES = [
  'Bug Report',
  'Feature Request',
  'Installation Issue',
  'General Question',
  'Other',
];

const FORM_ID = '1M9YI4smtBaFYUWYb8GEHuIa2ZSleWdtVYwRGotDfrhQ';
const GOOGLE_FORM_URL = `https://docs.google.com/forms/d/${FORM_ID}/formResponse`;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  const {
    fullName    = '',
    whatsapp    = '',
    email       = '',
    category    = '',
    description = '',
    steps       = '',
  } = req.body || {};

  // --- Validation ---

  if (!String(fullName).trim()) {
    return res.status(400).json({ success: false, error: 'Full name is required.' });
  }

  const hasWhatsapp = String(whatsapp).trim().replace(/\s+/g, '').length >= 7;
  const hasEmail    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  if (!hasWhatsapp && !hasEmail) {
    return res.status(400).json({
      success: false,
      error: 'At least one contact method is required: WhatsApp number or email.',
    });
  }

  if (!String(category).trim() || !VALID_CATEGORIES.includes(String(category).trim())) {
    return res.status(400).json({
      success: false,
      error: `Category is required. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
  }

  if (!String(description).trim()) {
    return res.status(400).json({ success: false, error: 'Issue description is required.' });
  }

  // --- Build form-urlencoded body ---
  const params = new URLSearchParams();
  params.append(ENTRY_IDS.fullName,    String(fullName).trim());
  if (whatsapp) params.append(ENTRY_IDS.whatsapp,    String(whatsapp).trim().replace(/\s+/g,''));
  if (email)    params.append(ENTRY_IDS.email,       String(email).trim());
  params.append(ENTRY_IDS.category,    String(category).trim());
  params.append(ENTRY_IDS.description, String(description).trim());
  if (steps)    params.append(ENTRY_IDS.steps,       String(steps).trim());

  // --- Submit to Google Forms ---
  try {
    const response = await fetch(GOOGLE_FORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://docs.google.com/forms/d/${FORM_ID}/viewform`,
        'Origin': 'https://docs.google.com',
      },
      body: params.toString(),
      redirect: 'manual', // Google returns 302 on success
    });

    // 200 = form rendered (no JS), 302 = redirect after submit (success), 0 = opaque (manual)
    if (response.status === 200 || response.status === 302 || response.status === 0) {
      return res.status(200).json({ success: true, message: 'Feedback submitted successfully!' });
    }

    return res.status(502).json({
      success: false,
      error: `Google Forms returned unexpected status ${response.status}.`,
    });
  } catch (err) {
    console.error('[submit-feedback] fetch error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit feedback. Please try again later.',
    });
  }
};
