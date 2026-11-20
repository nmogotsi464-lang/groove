// Paste this into checkout.html (inside <script>), and call payWithPayFast() from your Pay button.
// Adjust the three lines marked CHANGE to match your page.

const FUNCTION_URL = 'https://payfastadd.netlify.app/.netlify/functions/create-payment';

async function payWithPayFast() {
  const payButton = document.querySelector('#pay-button'); // CHANGE: your pay button's id
  if (payButton) { payButton.disabled = true; payButton.textContent = 'Please wait...'; }

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: new URLSearchParams(location.search).get('id'),   // e.g. SK0006
        item_name: 'Groove Galleria order',                   // CHANGE: product name variable
        amount: 0,                                            // CHANGE: product price variable (number)
        name_first: document.querySelector('#first-name')?.value, // CHANGE or remove
        name_last: document.querySelector('#last-name')?.value,   // CHANGE or remove
        email: document.querySelector('#email')?.value            // CHANGE or remove
      })
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Server replied: ' + text.slice(0, 120)); }
    if (!res.ok) throw new Error(data.error || 'Payment could not be started.');

    // Send the buyer to PayFast with the signed details.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = data.url;
    Object.entries(data.fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  } catch (err) {
    alert(err.message);
    if (payButton) { payButton.disabled = false; payButton.textContent = 'Pay with PayFast'; }
  }
}
