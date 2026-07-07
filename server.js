const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'alive' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on port ${PORT}`);
});
