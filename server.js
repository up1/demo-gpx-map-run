const express = require('express');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

const app = express();
const PORT = 80;
const GPX_DIR = path.join(__dirname, './gpx_files');

// Serve static files
app.use(express.static('public'));

// Helper: Parse a GPX file and return structured JSON
function parseGPXFile(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Extract metadata
  const metadataName = xmlDoc.getElementsByTagName('metadata')[0]
    ?.getElementsByTagName('name')[0]?.textContent || '';
  const metadataTime = xmlDoc.getElementsByTagName('metadata')[0]
    ?.getElementsByTagName('time')[0]?.textContent || '';

  // Extract waypoints (<wpt>)
  const wptElements = Array.from(xmlDoc.getElementsByTagName('wpt'));
  const waypoints = wptElements.map(wpt => ({
    lat: parseFloat(wpt.getAttribute('lat')),
    lon: parseFloat(wpt.getAttribute('lon')),
    ele: parseFloat(wpt.getElementsByTagName('ele')[0]?.textContent || '0'),
    name: wpt.getElementsByTagName('name')[0]?.textContent || '',
    type: wpt.getElementsByTagName('type')[0]?.textContent || ''
  }));

  // Extract route points (<rtept>)
  const rteptElements = Array.from(xmlDoc.getElementsByTagName('rtept'));
  const routePoints = rteptElements.map(rtept => ({
    lat: parseFloat(rtept.getAttribute('lat')),
    lon: parseFloat(rtept.getAttribute('lon')),
    ele: parseFloat(rtept.getElementsByTagName('ele')[0]?.textContent || '0')
  }));

  // Extract track points (<trk> -> <trkseg> -> <trkpt>)
  const tracks = [];
  const trkElements = Array.from(xmlDoc.getElementsByTagName('trk'));
  trkElements.forEach(trk => {
    const trackName = trk.getElementsByTagName('name')[0]?.textContent || '';
    const segments = [];
    const trksegElements = Array.from(trk.getElementsByTagName('trkseg'));
    trksegElements.forEach(trkseg => {
      const points = Array.from(trkseg.getElementsByTagName('trkpt')).map(trkpt => ({
        lat: parseFloat(trkpt.getAttribute('lat')),
        lon: parseFloat(trkpt.getAttribute('lon')),
        ele: parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || '0')
      }));
      segments.push(points);
    });
    tracks.push({ name: trackName, segments });
  });

  return {
    metadata: { name: metadataName, time: metadataTime },
    waypoints,
    routePoints,
    tracks
  };
}

// Middleware: sanitize :filename param to prevent directory traversal
function sanitizeFilename(req, res, next) {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  next();
}

// Helper: read a GPX file and call back with its contents
function readGPXFile(filename, res, callback) {
  const gpxPath = path.join(GPX_DIR, filename);
  fs.readFile(gpxPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading GPX file:', err);
      return res.status(500).json({ error: 'Failed to read GPX file' });
    }
    callback(data);
  });
}

// API endpoint to list available GPX files
app.get('/api/gpx/list', (req, res) => {
  fs.readdir(GPX_DIR, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return res.status(500).json({ error: 'Failed to list GPX files' });
    }
    const gpxFiles = files.filter(file => file.endsWith('.gpx'));
    res.json(gpxFiles);
  });
});

// API endpoint to get raw GPX XML data
app.get('/api/gpx/:filename', sanitizeFilename, (req, res) => {
  readGPXFile(req.params.filename, res, (data) => {
    res.header('Content-Type', 'application/xml');
    res.send(data);
  });
});

// API endpoint to get parsed GPX data as JSON
app.get('/api/gpx/:filename/parsed', sanitizeFilename, (req, res) => {
  readGPXFile(req.params.filename, res, (data) => {
    try {
      const parsed = parseGPXFile(data);
      res.json(parsed);
    } catch (parseErr) {
      console.error('Error parsing GPX file:', parseErr);
      res.status(500).json({ error: 'Failed to parse GPX file' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`GPX Viewer server running at http://localhost:${PORT}`);
});
