'use strict';

const fs   = require('fs');
const path = require('path');

function generateHTML({ dates, closes, fearGreed }) {
  const FG_WINDOW = 252;  // 恐贪图只取近 1 年

  const fgScores = fearGreed ? fearGreed.scores.slice(-FG_WINDOW) : [];
  const fgDates  = dates.slice(-FG_WINDOW);
  const fgLatest = fearGreed ? fearGreed.latestScore : null;
  const fgLabel  = fearGreed ? fearGreed.label : '';

  const fgCls = (s) => s >= 80 ? 'red' : s >= 60 ? 'orange' : s >= 40 ? 'yellow' : 'blue';
  const latestDate = dates[dates.length - 1] ?? '';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>上证指数 恐贪指数分析报告</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#c9d1d9;font-family:'Segoe UI',sans-serif;padding:24px}
    h1{text-align:center;color:#58a6ff;font-size:1.5rem;margin-bottom:6px}
    .sub{text-align:center;color:#8b949e;font-size:.85rem;margin-bottom:28px}
    .kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px 16px}
    .card .lbl{font-size:.72rem;color:#8b949e;margin-bottom:4px}
    .card .val{font-size:1.15rem;font-weight:700}
    .red{color:#f85149}.orange{color:#f0883e}.yellow{color:#e3b341}.blue{color:#58a6ff}.gray{color:#8b949e}
    .wrap{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px;margin-bottom:22px}
    .wrap h2{font-size:.9rem;color:#8b949e;margin-bottom:14px}
    .legend-hint{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px}
    .legend-hint span{font-size:.72rem;color:#8b949e}
  </style>
</head>
<body>
<h1>上证指数 · 市场恐贪指数分析报告</h1>
<p class="sub">最新日期：${latestDate} &nbsp;·&nbsp; 5指标简化模型 &nbsp;·&nbsp; 数据来源：腾讯财经</p>

<div class="kpi">
  ${fgLatest !== null ? `
  <div class="card"><div class="lbl">综合恐贪值</div><div class="val ${fgCls(fgLatest)}">${fgLatest.toFixed(1)} / 100</div></div>
  <div class="card"><div class="lbl">情绪判断</div><div class="val ${fgCls(fgLatest)}">${fgLabel}</div></div>` : ''}
  <div class="card"><div class="lbl">上证指数（最新）</div><div class="val" style="color:#58a6ff">${closes[closes.length-1]?.toFixed(2) ?? '–'} 点</div></div>
  <div class="card"><div class="lbl">区间涨跌（近3年）</div><div class="val" style="color:${(closes[closes.length-1]-closes[0])>=0?'#3fb950':'#f85149'}">${closes.length>1?((closes[closes.length-1]-closes[0])/closes[0]*100).toFixed(2)+'%':'–'}</div></div>
</div>

<div class="wrap">
  <h2>① 上证指数近3年收盘走势</h2>
  <canvas id="price" height="65"></canvas>
</div>

<div class="wrap">
  <h2>② 市场恐贪指数（近1年，5指标简化版）</h2>
  <div class="legend-hint">
    <span>– – 极度恐慌(0–20)</span>
    <span>– – 恐慌(20–40)</span>
    <span>– – 中性(40–60)</span>
    <span>– – 贪婪(60–80)</span>
    <span>– – 极度贪婪(80–100)</span>
  </div>
  <canvas id="feargreed" height="65"></canvas>
</div>

<script>
const D=${JSON.stringify(dates)};
const C=${JSON.stringify(closes)};
const FG=${JSON.stringify(fgScores)};
const FGD=${JSON.stringify(fgDates)};

const gc='rgba(48,54,61,0.8)',tc='#8b949e';
const base={responsive:true,interaction:{mode:'index',intersect:false},
  plugins:{legend:{labels:{color:tc,usePointStyle:true,pointStyleWidth:10}}},
  scales:{x:{ticks:{color:tc,maxTicksLimit:14,maxRotation:0},grid:{color:gc}},
          y:{ticks:{color:tc},grid:{color:gc}}}};

// ① 价格走势
new Chart(document.getElementById('price'),{type:'line',data:{labels:D,datasets:[
  {label:'上证收盘',data:C,borderColor:'#58a6ff',borderWidth:1.5,pointRadius:0,tension:0,
   backgroundColor:'rgba(88,166,255,0.06)',fill:true},
]},options:{...base,scales:{...base.scales,y:{...base.scales.y,title:{display:true,text:'点位',color:tc}}}}});

// ② 恐贪指数（带分区参考线）
if(FG.length > 0){
  new Chart(document.getElementById('feargreed'),{
    type:'line',
    data:{labels:FGD,datasets:[
      {label:'恐贪值',data:FG,borderColor:'rgba(200,200,200,0.9)',borderWidth:2,pointRadius:0,fill:false,spanGaps:false,tension:0.2},
      {label:'极度贪婪(80)',data:FGD.map(()=>80),borderColor:'rgba(248,81,73,0.35)',borderWidth:1,borderDash:[3,4],pointRadius:0,fill:false},
      {label:'贪婪(60)',    data:FGD.map(()=>60),borderColor:'rgba(240,136,62,0.4)', borderWidth:1,borderDash:[3,4],pointRadius:0,fill:false},
      {label:'中性(40)',    data:FGD.map(()=>40),borderColor:'rgba(227,179,65,0.4)', borderWidth:1,borderDash:[3,4],pointRadius:0,fill:false},
      {label:'恐慌(20)',    data:FGD.map(()=>20),borderColor:'rgba(121,192,255,0.4)',borderWidth:1,borderDash:[3,4],pointRadius:0,fill:false},
    ]},
    options:{...base,
      plugins:{...base.plugins,legend:{labels:{color:tc,filter:(i)=>i.text==='恐贪值',usePointStyle:true}}},
      scales:{
        x:{ticks:{color:tc,maxTicksLimit:14,maxRotation:0},grid:{color:gc}},
        y:{ticks:{color:tc,stepSize:20},grid:{color:gc},min:0,max:100,title:{display:true,text:'恐贪值',color:tc}},
      }
    }
  });
}
</script>
</body>
</html>`;

  const outPath = path.join(process.cwd(), 'report.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

module.exports = { generateHTML };
