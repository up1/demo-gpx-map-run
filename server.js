const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static('public'));

// API endpoint to list available GPX files
app.get('/api/gpx/list', (req, res) => {
  const gpxDir = path.join(__dirname, './gpx_files');
  fs.readdir(gpxDir, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return res.status(500).json({ error: 'Failed to list GPX files' });
    }
    const gpxFiles = files.filter(file => file.endsWith('.gpx'));
    res.json(gpxFiles);
  });
});

// API endpoint to get GPX data
app.get('/api/gpx/:filename', (req, res) => {
  const filename = req.params.filename;
  // Sanitize filename to prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  const gpxPath = path.join(__dirname, './gpx_files', filename);
  fs.readFile(gpxPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading GPX file:', err);
      return res.status(500).json({ error: 'Failed to read GPX file' });
    }
    res.header('Content-Type', 'application/xml');
    res.send(data);
  });
});

app.listen(PORT, () => {
  console.log(`GPX Viewer server running at http://localhost:${PORT}`);
});
