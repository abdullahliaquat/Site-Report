const express = require('express');
const app = express();
const port = 3000;

// Basic test endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({ message: 'Server is working!' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Server error', details: err.message });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on port ${port}`);
  console.log(`Test URL: http://localhost:${port}/api/test`);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
}); 