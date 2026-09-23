// Sends the one-time login code via EmailJS's REST API (server-side call).
// Requires "Allow non-browser access" enabled in EmailJS > Account > Security,
// and the Private Key set as EMAILJS_PRIVATE_KEY.
export async function sendLoginEmail({ toEmail, toName, code, magicLink }) {
  const {
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    EMAILJS_PUBLIC_KEY,
    EMAILJS_PRIVATE_KEY,
  } = process.env;

  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error('EmailJS is not configured (missing env vars)');
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: toEmail,
        to_name: toName || toEmail,
        login_code: code,
        magic_link: magicLink,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`EmailJS send failed (${res.status}): ${text}`);
  }
}
