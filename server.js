const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3008;

app.get('/api/cn/api/json_v2.php/CN_MarketDataService.getKLineData', async (req, res) => {
  const params = new URLSearchParams({
    symbol: req.query.symbol || 'sh000001',
    scale: req.query.scale || '5',
    datalen: req.query.datalen || '300',
  });
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://finance.sina.cn/',
      },
    });
    const text = await response.text();

    res.status(response.status);
    res.type('application/json');
    res.send(text);
  } catch (error) {
    console.error('新浪分钟K线代理失败:', error);
    res.status(502).json({ error: 'Failed to fetch minute data' });
  }
});

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 主页面路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '10-day-line.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`可以访问 http://localhost:${PORT}/10-day-line.html 查看页面`);
});
