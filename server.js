const express = require('express');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 8080;

const JSON_LIMIT = '2mb';
const TEXT_LIMIT = '2mb';

app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.static('public'));

let seatingData = {}; // 暫存座位設定

function runXz(args, inputBuffer) {
  return new Promise((resolve, reject) => {
    const xz = spawn('xz', args);

    const chunks = [];
    let stderr = '';

    xz.stdout.on('data', data => {
      chunks.push(data);
    });

    xz.stderr.on('data', data => {
      stderr += data.toString();
    });

    xz.on('error', err => {
      reject(err);
    });

    xz.on('close', code => {
      if (code !== 0) {
        const error = new Error(stderr || `xz exited with code ${code}`);
        error.code = code;
        reject(error);
        return;
      }

      resolve(Buffer.concat(chunks));
    });

    if (inputBuffer?.length) {
      xz.stdin.end(inputBuffer);
    } else {
      xz.stdin.end();
    }
  });
}

app.post('/api/lzma/compress', express.text({ limit: TEXT_LIMIT }), async (req, res) => {
  try {
    const rawText = typeof req.body === 'string' ? req.body : '';
    const inputBuffer = Buffer.from(rawText, 'utf8');
    const compressed = await runXz(['-zc'], inputBuffer);
    res.json({ data: compressed.toString('base64'), originalLength: inputBuffer.length });
  } catch (err) {
    console.error('LZMA 壓縮失敗:', err);
    res.status(500).json({ error: 'LZMA 壓縮失敗', details: err.message });
  }
});

app.post('/api/lzma/decompress', async (req, res) => {
  try {
    const { data } = req.body || {};
    if (typeof data !== 'string' || !data.trim()) {
      res.status(400).json({ error: '缺少要解壓縮的資料' });
      return;
    }

    const inputBuffer = Buffer.from(data, 'base64');
    const decompressed = await runXz(['-dc'], inputBuffer);
    res.json({ data: decompressed.toString('utf8') });
  } catch (err) {
    console.error('LZMA 解壓縮失敗:', err);
    res.status(500).json({ error: 'LZMA 解壓縮失敗', details: err.message });
  }
});

app.post('/api/seating', (req, res) => {
  seatingData = req.body;
  console.log('更新座位設定:', seatingData);
  res.status(200).send('座位設定已更新');
});

app.get('/api/seating', (req, res) => {
  res.json(seatingData);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
