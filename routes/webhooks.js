// routes/webhooks.js
const { Router } = require('express');
const router = Router();

// Validate the expected Respond.io payload shape
function validatePayload(body) {
  if (!body || !body.contact || !body.message) {
    return { valid: false, error: 'Missing contact or message in payload' };
  }
  const phone = body.contact.phone;
  const text = body.message?.message?.text || body.message?.text || '';
  if (!phone) {
    return { valid: false, error: 'No phone number in payload' };
  }
  return { valid: true, phone, text: text.trim().toLowerCase() };
}

router.post('/', async (req, res) => {
  console.log(`[Webhook] POST /webhooks/respondio`);

  // Step 1: Validate
  const validation = validatePayload(req.body);
  if (!validation.valid) {
    console.error(`[Webhook] Invalid payload: ${validation.error}`);
    return res.json({ reply: 'Sorry, I could not process that message. Please try again.' });
  }

  const { phone, text } = validation;
  console.log(`[Webhook] Phone: ${phone} | Text: "${text}"`);

  try {
    // Step 2: Route to appropriate handler
    let reply;
    switch (text) {
      case 'hi':
      case 'hello':
        reply = await handleMenu(phone);
        break;
      case 'policies':
        reply = await handlePolicies(phone);
        break;
      case 'statement':
        reply = await handleStatement(phone);
        break;
      default:
        reply = await handleUnknown(phone, text);
    }

    // Step 3: Return for Respond.io Response Mapping
    return res.json({ reply });
  } catch (error) {
    console.error(`[Webhook] Handler error: ${error.message}`);
    return res.json({ reply: 'An error occurred. Please try again later.' });
  }
});

module.exports = router;
