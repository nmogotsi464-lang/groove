# Getting the new checkout live

## 1. Add the files to your repo
Copy these into your `groove` repo (same folder as `index.html`, `shop.html`, `style.css`):
- `checkout.html`
- `thank-you.html`
- `netlify.toml`
- `netlify/functions/create-payment.js`
- `netlify/functions/notify.js`
- the updated `index.html` (replaces your current one)

## 2. Connect the repo to Netlify
1. Go to https://app.netlify.com → **Add new site → Import an existing project**
2. Choose GitHub → select the `groove` repo
3. Build settings: leave build command empty, publish directory = `.`
4. Deploy

Netlify will give you a URL like `groove-galleria.netlify.app` — the site itself keeps living on GitHub Pages via your domain; Netlify's only job here is running the two functions and hosting checkout.html/thank-you.html at your same domain if you point groovegalleria.co.za's DNS at Netlify instead (recommended, since it's a full static host too and it's free — ask me if you want help with that step).

## 3. Set your environment variables in Netlify
Site settings → Environment variables → add:

| Key | Value |
|---|---|
| `PAYFAST_MERCHANT_ID` | from your PayFast dashboard |
| `PAYFAST_MERCHANT_KEY` | from your PayFast dashboard |
| `PAYFAST_PASSPHRASE` | set one in PayFast → Settings → and copy it here too |
| `PAYFAST_MODE` | `sandbox` while testing, `live` when ready |
| `SITE_URL` | `https://groovegalleria.co.za` |
| `SHEETDB_ORDERS_URL` | (optional — see step 4) |

## 4. (Optional but recommended) Log paid orders
Create a second sheet/tab called **Orders** with columns: `order_id, pf_payment_id, item_name, amount, buyer_name, buyer_email, status, date`. Get its SheetDB API URL and set it as `SHEETDB_ORDERS_URL` above — this is how you'll see what's been paid for, since WhatsApp won't be doing that anymore.

## 5. Test in sandbox first
With `PAYFAST_MODE=sandbox`, go through a full checkout on your live site — PayFast's sandbox uses fake card numbers (they're on the PayFast sandbox page). Confirm you land on `thank-you.html` and that a row appears in your Orders sheet.

## 6. Go live
Flip `PAYFAST_MODE` to `live` in Netlify once testing checks out.

## 7. PayJustNow / Payflex
Check your PayFast merchant dashboard under **Settings → Payment Methods** — if PayJustNow/Payflex are listed there, just enable them and they'll appear as options on PayFast's own payment page automatically, no extra code needed. If they're not listed, come back and we'll add them as separate buttons.
