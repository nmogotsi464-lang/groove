// Netlify function: builds a signed PayFast payment request.
// Secrets come from Netlify environment variables, never from the website code.
const crypto = require('crypto');

const ALLOWED_ORIGINS = [
  'https://www.groovegalleria.co.za',
  'https://groovegalleria.co.za'
];

const SITE = 'https://www.groovegalleria.co.za';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

// PayFast expects PHP-style urlencode: spaces as "+", uppercase hex, and !'()* encoded.
function pfEncode(value) {
  return encodeURIComponent(String(value).trim())
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function sign(fields, passphrase) {
  let str = Object.keys(fields)
    .map(k => `${k}=${pfEncode(fields[k])}`)
    .join('&');
  if (passphrase) str += `&passphrase=${pfEncode(passphrase)}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

exports.handler = async (event) => {
  const headers = corsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  if (!merchantId || !merchantKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'PayFast credentials are not set in Netlify.' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request.' }) };
  }

  const amount = Number(data.amount);
  if (!isFinite(amount) || amount < 5) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid amount (minimum R5.00).' }) };
  }

  const sandbox = process.env.PAYFAST_SANDBOX === 'true';
  const baseUrl = process.env.URL || 'https://payfastadd.netlify.app';

  // Order matters: PayFast signs fields in exactly this order.
  const raw = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${SITE}/success.html`,
    cancel_url: `${SITE}/checkout.html${data.id ? '?id=' + encodeURIComponent(data.id) : ''}`,
    notify_url: `${baseUrl}/.netlify/functions/notify`,
    name_first: data.name_first,
    name_last: data.name_last,
    email_address: data.email,
    m_payment_id: `GG-${Date.now()}`,
    amount: amount.toFixed(2),
    item_name: String(data.item_name || 'Groove Galleria order').slice(0, 100),
    custom_str1: data.id // product id, e.g. SK0006
  };

  // PayFast ignores blank fields, so leave them out of the signature too.
  const fields = {};
  Object.keys(raw).forEach(k => {
    if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') fields[k] = raw[k];
  });
  fields.signature = sign(fields, passphrase);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      url: sandbox ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process',
      fields
    })
  };
};
