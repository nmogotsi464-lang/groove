// netlify/functions/notify.js
//
// PayFast calls this URL directly (server-to-server, the customer never
// sees it) after a payment completes. This is the ONLY reliable way to
// know a payment actually succeeded — never trust the return_url alone,
// since a customer could land there without ever actually paying.

const crypto = require("crypto");

const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;
const PAYFAST_MODE = process.env.PAYFAST_MODE || "sandbox";
const SHEETDB_ORDERS_URL = process.env.SHEETDB_ORDERS_URL; // a separate "Orders" sheet — see setup notes

const PAYFAST_VALIDATE_HOST =
  PAYFAST_MODE === "live"
    ? "https://www.payfast.co.za/eng/query/validate"
    : "https://sandbox.payfast.co.za/eng/query/validate";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const params = new URLSearchParams(event.body);
    const data = Object.fromEntries(params);

    // 1. Verify the signature PayFast sent matches what we'd compute
    const receivedSignature = data.signature;
    const dataForSig = { ...data };
    delete dataForSig.signature;
    const expectedSignature = generateSignature(dataForSig, PAYFAST_PASSPHRASE);

    if (receivedSignature !== expectedSignature) {
      console.error("PayFast ITN: signature mismatch");
      return { statusCode: 400, body: "Invalid signature" };
    }

    // 2. Ask PayFast to confirm the ITN is genuine (server-to-server check)
    const verifyRes = await fetch(PAYFAST_VALIDATE_HOST, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: event.body,
    });
    const verifyText = await verifyRes.text();
    if (verifyText.trim() !== "VALID") {
      console.error("PayFast ITN: not confirmed valid by PayFast");
      return { statusCode: 400, body: "Not valid" };
    }

    // 3. Only act on completed payments
    if (data.payment_status !== "COMPLETE") {
      return { statusCode: 200, body: "OK (not complete)" };
    }

    // 4. Log the order (adjust to whatever storage you end up using)
    if (SHEETDB_ORDERS_URL) {
      await fetch(SHEETDB_ORDERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            order_id: data.m_payment_id,
            pf_payment_id: data.pf_payment_id,
            item_name: data.item_name,
            amount: data.amount_gross,
            buyer_name: data.name_first,
            buyer_email: data.email_address,
            status: "paid",
            date: new Date().toISOString(),
          },
        }),
      });
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};

function generateSignature(fields, passphrase) {
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
