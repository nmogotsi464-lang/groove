// netlify/functions/create-payment.js
//
// Called by checkout.html when the customer clicks "Pay Now".
// Looks up the REAL price for the product from SheetDB (never trusts
// a price sent from the browser — that would let anyone edit the page
// and pay R1 for anything), builds the PayFast field set, signs it,
// and returns everything the browser needs to redirect to PayFast.

const crypto = require("crypto");

const SHEETDB_URL = process.env.SHEETDB_PRODUCTS_URL || "https://sheetdb.io/api/v1/5rx85jjefrjui";
const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE; // set this in PayFast settings AND Netlify env
const PAYFAST_MODE = process.env.PAYFAST_MODE || "sandbox"; // "sandbox" or "live"
const SITE_URL = process.env.SITE_URL || "https://groovegalleria.co.za";

const PAYFAST_HOST =
  PAYFAST_MODE === "live"
    ? "https://www.payfast.co.za/eng/process"
    : "https://sandbox.payfast.co.za/eng/process";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { productId, quantity, buyerName, buyerEmail } = JSON.parse(event.body || "{}");

    if (!productId) {
      return { statusCode: 400, body: JSON.stringify({ error: "productId is required" }) };
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // 1. Look up the product server-side so the price can't be tampered with
    const res = await fetch(SHEETDB_URL);
    const products = await res.json();
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return { statusCode: 404, body: JSON.stringify({ error: "Product not found" }) };
    }
    if (Number(product.stock) <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Out of stock" }) };
    }

    const amount = (parseFloat(product.price) * qty).toFixed(2);
    const orderId = `${productId}-${Date.now()}`; // simple unique reference

    // 2. Build the PayFast field set (order matters for signature generation)
    const fields = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${SITE_URL}/thank-you.html?order=${orderId}`,
      cancel_url: `${SITE_URL}/checkout.html?id=${productId}&cancelled=1`,
      notify_url: `${SITE_URL}/.netlify/functions/notify`,
      name_first: (buyerName || "Customer").slice(0, 100),
      email_address: buyerEmail || "",
      m_payment_id: orderId,
      amount,
      item_name: `${product.name} x${qty}`.slice(0, 100),
    };

    // Drop empty fields — PayFast signature must exclude blanks
    Object.keys(fields).forEach((k) => {
      if (fields[k] === "" || fields[k] === undefined || fields[k] === null) delete fields[k];
    });

    // 3. Sign it
    const signature = generateSignature(fields, PAYFAST_PASSPHRASE);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: PAYFAST_HOST,
        fields: { ...fields, signature },
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};

function generateSignature(fields, passphrase) {
  // PayFast spec: concatenate key=value pairs (URL-encoded, spaces as +)
  // in the exact order they'll be posted, append passphrase if set, MD5 it.
  let pfOutput = "";
  for (const key in fields) {
    pfOutput += `${key}=${encodeURIComponent(fields[key].toString().trim()).replace(/%20/g, "+")}&`;
  }
  pfOutput = pfOutput.slice(0, -1);
  if (passphrase) {
    pfOutput += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }
  return crypto.createHash("md5").update(pfOutput).digest("hex");
}
