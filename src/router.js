const Router = require("express").Router;
const { tokenGenerator, voiceResponse } = require("./handler");

const router = new Router();

router.get("/token", (req, res) => {
  console.log('Token request received');
  try {
    const tokenData = tokenGenerator();
    console.log('Token generated for identity:', tokenData.identity);
    res.json(tokenData);
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Handle both /voice and /voices endpoints
router.post(["/voice", "/voices"], (req, res) => {
  console.log('Voice request received:', req.body);
  try {
    res.set("Content-Type", "text/xml");
    const twiml = voiceResponse(req.body);
    console.log('TwiML response:', twiml);
    res.send(twiml);
  } catch (error) {
    console.error('Error generating TwiML:', error);
    res.status(500).send('<Response><Say>An error occurred</Say></Response>');
  }
});

module.exports = router;