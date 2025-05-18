const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

let seatingData = {};  // 暫存座位設定

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
