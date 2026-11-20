// Netlify function: PayFast calls this (ITN) after a payment to confirm it really happened.
const crypto = require('crypto');

function pfEncode(value) {
  return encodeURIComponent(String(value).trim())
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  const sandbox = process.env.PAYFAST_SANDBOX === 'true';

  // Keep the fields in the order PayFast sent them.
  const params = new URLSearchParams(event.body || '');
  const received = {};
  for (const [k, v] of params.entries()) received[k] = v;

  // 1. Check the signature.
  const theirSignature = received.signature;
  let str = Object.keys(received)
    .filter(k => k !== 'signature')
    .map(k => `${k}=${pfEncode(received[k])}`)
    .join('&');
  if (passphrase) str += `&passphrase=${pfEncode(passphrase)}`;
  const mySignature = crypto.createHash('md5').update(str).digest('hex');
  if (mySignature !== theirSignature) {
    console.error('ITN signature mismatch', received.m_payment_id);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // 2. Ask PayFast to confirm the data is genuine.
  const validateUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/query/validate'
    : 'https://www.payfast.co.za/eng/query/validate';
  try {
    const res = await fetch(validateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: event.body
    });
    const text = (await res.text()).trim();
    if (text !== 'VALID') {
      console.error('ITN validation failed:', text);
      return { statusCode: 400, body: 'Validation failed' };
    }
  } catch (e) {
    console.error('ITN validation error', e);
    return { statusCode: 500, body: 'Validation error' };
  }

  // 3. Payment is genuine. Record it (visible in Netlify > Logs > Functions).
  if (received.payment_status === 'COMPLETE') {
    console.log('PAID', JSON.stringify({
      order: received.m_payment_id,
      product: received.custom_str1,
      amount: received.amount_gross,
      email: received.email_address,
      payfast_id: received.pf_payment_id
    }));
  } else {
    console.log('Payment status:', received.payment_status, received.m_payment_id);
  }

  return { statusCode: 200, body: 'OK' };
};
