const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  const requestHeaders = req.headers['access-control-request-headers'];
  if (requestHeaders) {
    res.header('Access-Control-Allow-Headers', requestHeaders);
  } else {
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());
app.use(express.static('public'));

let seatingData = {};  // 暫存座位設定
let overlayConfig = null; // 暫存 overlay 劇本設定

app.post('/api/seating', (req, res) => {
  seatingData = req.body;
  console.log('更新座位設定:', seatingData);
  res.status(200).send('座位設定已更新');
});

app.get('/api/seating', (req, res) => {
  res.json(seatingData);
});

app.post('/api/overlay-config', (req, res) => {
  overlayConfig = req.body || null;
  console.log('更新 Overlay 設定:', overlayConfig);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.status(200).json({ status: 'ok' });
});

app.get('/api/overlay-config', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.json(overlayConfig || {});
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
