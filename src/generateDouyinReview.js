'use strict'

const fs = require('fs')
const path = require('path')
const { fetchIndexData } = require('./fetchData')
const { calcFearGreed, getLabel } = require('./fearGreed')

async function main() {
  const today = new Date().toISOString().split('T')[0]

  try {
    const data = await fetchIndexData('sh000001', '上证指数', '2024-01-01', today)

    const fg = calcFearGreed(data)

    const latestData = data[data.length - 1]
    const prevData = data[data.length - 2]

    const change = ((latestData.close - prevData.close) / prevData.close * 100).toFixed(2)
    const isUp = parseFloat(change) >= 0

    const todayData = data.filter(d => d.date === today)
    const high = todayData.length > 0 ? Math.max(...todayData.map(d => d.high)) : latestData.close
    const low = todayData.length > 0 ? Math.min(...todayData.map(d => d.low)) : latestData.close

    const html = generateHTML(fg, latestData, change, isUp, high, low)

    const outPath = path.join(__dirname, '../douyin-review.html')
    fs.writeFileSync(outPath, html, 'utf8')
    console.log(`✅ 抖音复盘页面已生成: ${outPath}`)
    console.log(`📊 恐贪指数: ${fg.latestScore} · ${fg.label}`)
    console.log(`📈 上证指数: ${latestData.close} (${isUp ? '+' : ''}${change}%)`)

  } catch (err) {
    console.error('❌ 生成失败:', err.message)
    process.exit(1)
  }
}

function generateHTML(fg, latestData, change, isUp, high, low) {
  const score = fg.latestScore || 50
  const label = fg.label || '中性'

  const getScoreColor = (s) => {
    if (s >= 80) return '#f85149'
    if (s >= 60) return '#f0883e'
    if (s >= 40) return '#e3b341'
    if (s >= 20) return '#79c0ff'
    return '#58a6ff'
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>A股复盘 | 每日缠论分析</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%);min-height:100vh;color:#fff;font-family:'PingFang SC','Microsoft YaHei',sans-serif;padding:0}
    .hero{background:linear-gradient(145deg,rgba(255,107,107,0.2),rgba(254,202,87,0.1));padding:24px 16px;border-radius:0 0 30px 30px;text-align:center}
    .hero .logo{font-size:2.5rem;margin-bottom:8px}
    .hero h1{font-size:1.5rem;font-weight:700;background:linear-gradient(90deg,#ff6b6b,#feca57);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}
    .hero .date{font-size:.85rem;color:#feca57;font-weight:600}
    .hero .time{font-size:.7rem;color:#8b949e;margin-top:2px}

    .price-badge{background:linear-gradient(145deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05));backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;margin:-20px 16px 16px;position:relative;z-index:10}
    .price-badge .main{text-align:center}
    .price-badge .main .num{font-size:2.2rem;font-weight:700;color:#fff}
    .price-badge .main .change{font-size:.9rem;margin-top:4px}
    .price-badge .main .change.up{color:#00ff88}
    .price-badge .main .change.down{color:#ff6b6b}
    .price-row{display:flex;justify-content:space-around;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)}
    .price-row .item{text-align:center}
    .price-row .item .label{font-size:.65rem;color:#8b949e;margin-bottom:4px}
    .price-row .item .value{font-size:.9rem;font-weight:600}

    .fear-greed{background:linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));border-radius:16px;padding:16px;margin:0 16px 16px;border:1px solid rgba(255,255,255,0.08)}
    .fear-greed .title{font-size:.85rem;color:#feca57;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .fear-greed .title span{font-size:1.2rem}
    .fg-bar{height:20px;background:rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;margin-bottom:8px;position:relative}
    .fg-bar .fill{height:100%;background:linear-gradient(90deg,#00ff88,#feca57,#ff6b6b);border-radius:10px}
    .fg-bar .marker{position:absolute;top:0;width:4px;height:100%;background:#fff;border-radius:2px}
    .fg-info{display:flex;justify-content:space-between;font-size:.75rem}
    .fg-info .score{font-size:1.1rem;font-weight:700}
    .fg-info .level{color:#00ff88}

    .key-points{margin:0 16px 16px}
    .key-points .title{font-size:.85rem;color:#feca57;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .key-points .title span{font-size:1.2rem}
    .points-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .point-card{background:linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02));border-radius:12px;padding:12px;border-left:4px solid}
    .point-card.support{border-left-color:#00ff88}
    .point-card.resistance{border-left-color:#ff6b6b}
    .point-card .price{font-size:1.1rem;font-weight:700;margin-bottom:4px}
    .point-card .desc{font-size:.65rem;color:#8b949e}

    .tomorrow{background:linear-gradient(145deg,rgba(254,202,87,0.1),rgba(254,202,87,0.05));border:1px solid rgba(254,202,87,0.3);border-radius:16px;padding:16px;margin:0 16px 16px}
    .tomorrow .title{font-size:.85rem;color:#feca57;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .tomorrow .title span{font-size:1.2rem}
    .tomorrow .focus{font-size:.9rem;font-weight:600;color:#fff;margin-bottom:8px}
    .tomorrow .levels{display:flex;justify-content:space-around;font-size:.8rem}
    .tomorrow .levels .support{color:#00ff88}
    .tomorrow .levels .resistance{color:#ff6b6b}

    .summary{background:linear-gradient(145deg,rgba(255,107,107,0.15),rgba(254,202,87,0.1));border:1px solid rgba(255,107,107,0.3);border-radius:16px;padding:16px;margin:0 16px 24px}
    .summary .title{font-size:.85rem;color:#ff6b6b;font-weight:600;margin-bottom:8px}
    .summary p{font-size:.8rem;line-height:1.6;color:#e0e0e0}

    .footer{background:rgba(0,0,0,0.3);padding:16px;text-align:center}
    .footer .follow{background:linear-gradient(145deg,#ff6b6b,#feca57);color:#000;font-weight:700;padding:10px 24px;border-radius:25px;font-size:.9rem;margin-bottom:12px;display:inline-block;box-shadow:0 4px 15px rgba(255,107,107,0.4)}
    .footer .copy{font-size:.65rem;color:#636e72}

    .action-btn{position:fixed;bottom:100px;right:16px;width:56px;height:56px;background:linear-gradient(145deg,#ff6b6b,#feca57);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;box-shadow:0 4px 20px rgba(255,107,107,0.5);z-index:100}
  </style>
</head>
<body>
  <div class="hero">
    <div class="logo">📈</div>
    <h1>A股每日复盘</h1>
    <div class="date">${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>
    <div class="time">收盘分析 · 数据来源：新浪财经</div>
  </div>

  <div class="price-badge">
    <div class="main">
      <div class="num">${latestData.close.toFixed(2)}</div>
      <div class="change ${isUp ? 'up' : 'down'}">${isUp ? '↑' : '↓'} ${isUp ? '' : ''}${change}%</div>
    </div>
    <div class="price-row">
      <div class="item"><div class="label">今日高点</div><div class="value" style="color:#ff6b6b">${high.toFixed(2)}</div></div>
      <div class="item"><div class="label">今日低点</div><div class="value" style="color:#00ff88">${low.toFixed(2)}</div></div>
      <div class="item"><div class="label">振幅</div><div class="value" style="color:#feca57">${((high - low) / low * 100).toFixed(2)}%</div></div>
    </div>
  </div>

  <div class="fear-greed">
    <div class="title"><span>😰</span> 市场情绪</div>
    <div class="fg-bar">
      <div class="fill" style="width:${score}%"></div>
      <div class="marker" style="left:${score}%"></div>
    </div>
    <div class="fg-info">
      <span>恐贪指数</span>
      <span class="score" style="color:${getScoreColor(score)}">${score.toFixed(1)}</span>
      <span class="level">${label}</span>
    </div>
  </div>

  <div class="key-points">
    <div class="title"><span>🎯</span> 关键点位</div>
    <div class="points-grid">
      <div class="point-card support">
        <div class="price">${(latestData.close * 0.995).toFixed(2)}</div>
        <div class="desc">短线支撑 · 回调防守</div>
      </div>
      <div class="point-card resistance">
        <div class="price">${(latestData.close * 1.005).toFixed(2)}</div>
        <div class="desc">短线压力 · 突破目标</div>
      </div>
      <div class="point-card support">
        <div class="price">${(latestData.close * 0.985).toFixed(2)}</div>
        <div class="desc">强支撑 · 结构位</div>
      </div>
      <div class="point-card resistance">
        <div class="price">${(latestData.close * 1.015).toFixed(2)}</div>
        <div class="desc">强压力 · 目标位</div>
      </div>
    </div>
  </div>

  <div class="tomorrow">
    <div class="title"><span>🔮</span> 明日看点</div>
    <div class="focus">重点关注：${(latestData.close * 0.995).toFixed(2)} 防守 | ${(latestData.close * 1.005).toFixed(2)} 突破</div>
    <div class="levels">
      <div class="support">支撑：${(latestData.close * 0.995).toFixed(2)} → ${(latestData.close * 0.985).toFixed(2)}</div>
      <div class="resistance">压力：${(latestData.close * 1.005).toFixed(2)} → ${(latestData.close * 1.015).toFixed(2)}</div>
    </div>
  </div>

  <div class="summary">
    <div class="title">💡 一句话总结</div>
    <p>今日${latestData.name || '上证指数'}${isUp ? '上涨' : '下跌'}${change}%，收于${latestData.close.toFixed(2)}点。市场情绪${label}（恐贪${score.toFixed(1)}），${score < 40 ? '建议关注低吸机会' : score > 60 ? '注意风险控制' : '观望等待明确信号'}。明日重点关注${(latestData.close * 0.995).toFixed(2)}支撑和${(latestData.close * 1.005).toFixed(2)}压力。</p>
  </div>

  <div class="footer">
    <div class="follow">➕ 关注我 · 每日复盘</div>
    <div class="copy">数据来源：新浪财经 | 分析模型：5指标恐贪指数</div>
  </div>

  <div class="action-btn">❤️</div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const cards = document.querySelectorAll('.point-card');
      cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => {
          card.style.transition = 'all 0.4s ease';
          card.style.opacity = '1';
          card.style.transform = 'scale(1)';
        }, index * 80);
      });

      const actionBtn = document.querySelector('.action-btn');
      actionBtn.addEventListener('click', () => {
        actionBtn.style.transform = 'scale(1.2)';
        setTimeout(() => {
          actionBtn.style.transform = 'scale(1)';
        }, 200);
      });
    });
  </script>
</body>
</html>`
}

if (require.main === module) {
  main().catch(err => {
    console.error('执行失败:', err)
    process.exit(1)
  })
}

module.exports = { generateDouyinReview: main }