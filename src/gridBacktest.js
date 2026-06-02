#!/usr/bin/env node

// ─── 网格交易策略回测系统 ────────────────────────────────────
// 策略逻辑：
// 1. 网格间距：3%-5%（根据波动率调整）
// 2. 底仓：初始投入50%资金，每下跌一格买入一份，每上涨一格卖出一份
// 3. 基准价：选取箱体中间价或年线位置
// 4. 回测时间范围：2024-10-10 到 2026-03-17

const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const Table = require('cli-table3')

// ─── 导入工具函数 ──────────────────────────────────────────
const { fetchIndexData } = require('./fetchData')

// ─── 配置 ──────────────────────────────────────────────────
const INDICES = [
  { symbol: 'sh000001', name: '上证指数', category: '沪深' },
  { symbol: 'sh000300', name: '沪深300', category: '沪深' },
  { symbol: 'sh000905', name: '中证500', category: '中证' },
  { symbol: 'sh000821', name: '红利', category: '红利' },
  { symbol: 'sh000688', name: '科创50', category: '科芯' },
]

// 回测时间范围
const START_DATE = '2024-10-10'
const END_DATE = '2026-03-17'

// 策略参数
const STRATEGY_PARAMS = {
  BASE_POSITION: 50,     // 底仓比例（百分比）
  GRID_SPACING: 4,       // 网格间距（百分比）
  MAX_GRID_LEVELS: 10,    // 最大网格层数
  INITIAL_CAPITAL: 100000, // 初始资金
  MA250: 250,           // 年线（250日均线）
}

// ─── 工具函数 ──────────────────────────────────────────────

/**
 * 计算移动平均线
 * @param {number[]} data - 价格数据数组
 * @param {number} period - 周期
 * @returns {number[]} 移动平均线数组
 */
function calculateMA (data, period) {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val, 0)
      result.push(sum / period)
    }
  }
  return result
}

/**
 * 计算箱体中间价
 * @param {number[]} prices - 价格数据数组
 * @returns {number} 箱体中间价
 */
function calculateBoxMiddlePrice (prices) {
  const maxPrice = Math.max(...prices)
  const minPrice = Math.min(...prices)
  return (maxPrice + minPrice) / 2
}

/**
 * 计算波动率
 * @param {number[]} prices - 价格数据数组
 * @returns {number} 波动率（百分比）
 */
function calculateVolatility (prices) {
  if (prices.length < 2) return 0

  const returns = []
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }

  const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length
  const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100 // 年化波动率

  return volatility
}

/**
 * 执行网格交易回测
 * @param {Array} data - 日线数据
 * @param {Object} idx - 指数信息
 * @returns {Object} 回测结果
 */
function backtestGridStrategy (data, idx) {
  const prices = data.map(d => d.close)
  const dates = data.map(d => d.date)

  // 计算年线
  const ma250 = calculateMA(prices, STRATEGY_PARAMS.MA250)

  // 计算波动率并调整网格间距
  const volatility = calculateVolatility(prices)
  let gridSpacing = STRATEGY_PARAMS.GRID_SPACING

  // 根据指数特性和波动率设置合适的网格间距
  // 上证指数：波动率较低
  if (idx.symbol === 'sh000001') {
    if (volatility > 25) {
      gridSpacing = 3 // 高波动时使用3%网格
    } else if (volatility > 15) {
      gridSpacing = 2.5 // 中等波动时使用2.5%网格
    } else {
      gridSpacing = 2 // 低波动时使用2%网格
    }
  }
  // 沪深300：使用2.5%网格间距
  else if (idx.symbol === 'sh000300') {
    gridSpacing = 2.5 // 固定使用2.5%网格间距
  }
  // 中证500：波动率中等
  else if (idx.symbol === 'sh000905') {
    if (volatility > 30) {
      gridSpacing = 4 // 高波动时使用4%网格
    } else if (volatility > 20) {
      gridSpacing = 3.5 // 中等波动时使用3.5%网格
    } else {
      gridSpacing = 3 // 低波动时使用3%网格
    }
  }
  // 红利：波动率最低
  else if (idx.symbol === 'sh000821') {
    if (volatility > 20) {
      gridSpacing = 2.5 // 高波动时使用2.5%网格
    } else {
      gridSpacing = 2 // 低波动时使用2%网格
    }
  }
  // 科创50：波动率最高
  else if (idx.symbol === 'sh000688') {
    if (volatility > 40) {
      gridSpacing = 4 // 高波动时使用4%网格
    } else if (volatility > 30) {
      gridSpacing = 3.5 // 中等波动时使用3.5%网格
    } else {
      gridSpacing = 3 // 低波动时使用3%网格
    }
  }

  // 确定基准价
  const ma250Value = ma250[ma250.length - 1] || calculateBoxMiddlePrice(prices)
  const basePrice = ma250Value

  // 初始化回测参数
  let currentPrice = prices[0]
  let capital = STRATEGY_PARAMS.INITIAL_CAPITAL
  let basePosition = (STRATEGY_PARAMS.BASE_POSITION / 100) * capital / basePrice
  let totalPosition = basePosition
  let gridLevels = []
  let trades = []

  // 生成初始网格
  for (let i = 1; i <= STRATEGY_PARAMS.MAX_GRID_LEVELS; i++) {
    gridLevels.push({
      buyPrice: basePrice * Math.pow(1 - gridSpacing / 100, i),
      sellPrice: basePrice * Math.pow(1 + gridSpacing / 100, i),
      level: i
    })
  }

  // 记录初始状态
  trades.push({
    date: dates[0],
    type: 'init',
    price: basePrice,
    position: totalPosition,
    capital: capital,
    gridSpacing: gridSpacing
  })

  // 执行回测
  for (let i = 1; i < prices.length; i++) {
    const price = prices[i]
    const date = dates[i]

    // 检查是否触发买入网格
    for (const grid of gridLevels) {
      if (price <= grid.buyPrice && currentPrice > grid.buyPrice) {
        // 买入一份
        const buyAmount = (STRATEGY_PARAMS.BASE_POSITION / 100) * capital / price / 2
        if (capital >= buyAmount * price) {
          capital -= buyAmount * price
          totalPosition += buyAmount
          trades.push({
            date: date,
            type: 'buy',
            price: price,
            position: totalPosition,
            capital: capital,
            level: grid.level
          })
        }
      }
    }

    // 检查是否触发卖出网格
    for (const grid of gridLevels) {
      if (price >= grid.sellPrice && currentPrice < grid.sellPrice) {
        // 卖出一份
        const sellAmount = (STRATEGY_PARAMS.BASE_POSITION / 100) * STRATEGY_PARAMS.INITIAL_CAPITAL / basePrice / 2
        if (totalPosition >= sellAmount) {
          capital += sellAmount * price
          totalPosition -= sellAmount
          trades.push({
            date: date,
            type: 'sell',
            price: price,
            position: totalPosition,
            capital: capital,
            level: grid.level
          })
        }
      }
    }

    currentPrice = price
  }

  // 计算最终资产价值
  const finalAssetValue = capital + totalPosition * prices[prices.length - 1]
  const totalReturn = (finalAssetValue - STRATEGY_PARAMS.INITIAL_CAPITAL) / STRATEGY_PARAMS.INITIAL_CAPITAL
  const buyAndHoldReturn = (prices[prices.length - 1] - prices[0]) / prices[0]

  return {
    totalReturn,
    buyAndHoldReturn,
    trades,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    startPrice: prices[0],
    endPrice: prices[prices.length - 1],
    initialCapital: STRATEGY_PARAMS.INITIAL_CAPITAL,
    finalAssetValue: finalAssetValue,
    gridSpacing: gridSpacing,
    basePrice: basePrice
  }
}

// ─── 主函数 ────────────────────────────────────────────────
async function main (showDetail = false) {
  console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════╗'))
  console.log(chalk.bold.cyan('║                网格交易策略回测系统                    ║'))
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════╝'))
  console.log()
  console.log(chalk.bold.yellow(`回测时间范围: ${START_DATE} → ${END_DATE}`))
  console.log(chalk.bold.yellow('网格间距: 3%-5%（根据波动率调整）'))
  console.log(chalk.bold.yellow('底仓: 初始投入50%资金，每下跌一格买入一份，每上涨一格卖出一份'))
  console.log(chalk.bold.yellow('基准价: 选取箱体中间价或年线位置'))
  console.log()

  const results = []

  for (const idx of INDICES) {
    try {
      console.log(chalk.blue(`正在回测 ${idx.name} (${idx.symbol})...`))

      // 获取日线数据
      const dailyData = await fetchIndexData(idx.symbol, idx.name, START_DATE, END_DATE, 1000)

      if (dailyData.length < 2) {
        console.log(chalk.yellow(`  ${idx.name} 数据不足，跳过回测`))
        results.push({ ...idx, error: '数据不足' })
        continue
      }

      // 执行回测
      const backtestResult = backtestGridStrategy(dailyData, idx)

      results.push({
        ...idx,
        ...backtestResult
      })

      console.log(chalk.green(`  ✓ ${idx.name} 回测完成`))

    } catch (error) {
      console.log(chalk.red(`  ✗ ${idx.name} 回测失败: ${error.message}`))
      results.push({ ...idx, error: error.message })
    }
  }

  // 生成报告
  generateReport(results, showDetail)
}

// ─── 报告生成 ──────────────────────────────────────────────
function generateReport (results, showDetail = false) {
  console.log('\n' + chalk.bold.cyan('╔══════════════════════════════════════════════════════╗'))
  console.log(chalk.bold.cyan('║                回测结果报告                            ║'))
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════╝\n'))

  // 详细回测结果表格
  const t = new Table({
    head: ['指数', '总收益', '买入持有收益率', '交易次数', '网格间距', '开始日期', '结束日期'].map(h => chalk.bold(h)),
    colWidths: [13, 15, 15, 10, 10, 12, 12],
    style: { border: ['cyan'] },
  })

  for (const r of results) {
    if (r.error) {
      t.push([r.name, '–', '–', '–', '–', '–', '–'])
      continue
    }

    t.push([
      r.name,
      `${(r.totalReturn * 100).toFixed(2)}%`,
      `${(r.buyAndHoldReturn * 100).toFixed(2)}%`,
      r.trades.length - 1, // 减去初始记录
      `${r.gridSpacing}%`,
      r.startDate,
      r.endDate
    ])
  }

  console.log(t.toString())

  // 交易明细
  if (showDetail) {
    console.log('\n' + chalk.bold.yellow('交易明细:'))
    for (const r of results) {
      if (r.error) continue

      console.log(`\n${chalk.bold(r.name)}:`)
      console.log(chalk.gray(`  基准价: ${r.basePrice.toFixed(2)}, 网格间距: ${r.gridSpacing}%`))
      console.log(chalk.gray('  交易记录:'))

      for (const trade of r.trades) {
        if (trade.type === 'init') {
          console.log(chalk.blue(`    ${trade.date} 初始化: 价格=${trade.price.toFixed(2)}, 仓位=${trade.position.toFixed(2)}, 资金=${trade.capital.toFixed(2)}`))
        } else if (trade.type === 'buy') {
          console.log(chalk.green(`    ${trade.date} 买入: 价格=${trade.price.toFixed(2)}, 仓位=${trade.position.toFixed(2)}, 资金=${trade.capital.toFixed(2)}, 网格级别=${trade.level}`))
        } else {
          console.log(chalk.red(`    ${trade.date} 卖出: 价格=${trade.price.toFixed(2)}, 仓位=${trade.position.toFixed(2)}, 资金=${trade.capital.toFixed(2)}, 网格级别=${trade.level}`))
        }
      }

      console.log(chalk.gray(`  初始资金: ${r.initialCapital.toFixed(2)}, 最终资产: ${r.finalAssetValue.toFixed(2)}`))
    }
  }

  // 生成HTML报告
  generateHTMLReport(results)
}

/**
 * 生成HTML报告
 * @param {Array} results - 回测结果数组
 */
function generateHTMLReport (results) {
  const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>网格交易策略回测报告</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      background-color: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
      text-align: center;
    }
    h2 {
      color: #555;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    h3 {
      color: #333;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    .summary {
      background-color: #f8f9fa;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .summary p {
      margin: 5px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background-color: #4CAF50;
      color: white;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background-color: #f2f2f2;
    }
    .trade-table {
      margin-top: 10px;
    }
    .trade-table th {
      background-color: #2196F3;
    }
    .buy {
      color: green;
      font-weight: bold;
    }
    .sell {
      color: red;
      font-weight: bold;
    }
    .init {
      color: blue;
      font-weight: bold;
    }
    .index-section {
      margin-bottom: 40px;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 5px;
    }
    .index-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .index-header h3 {
      color: #333;
    }
    .index-stats {
      font-size: 14px;
      color: #666;
    }
    .chart-container {
      width: 100%;
      height: 400px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>网格交易策略回测报告</h1>
    
    <div class="summary">
      <h2>回测概述</h2>
      <p><strong>回测时间范围:</strong> ${START_DATE} → ${END_DATE}</p>
      <p><strong>网格间距:</strong> 3%-5%（根据波动率调整）</p>
      <p><strong>底仓:</strong> 初始投入50%资金，每下跌一格买入一份，每上涨一格卖出一份</p>
      <p><strong>基准价:</strong> 选取箱体中间价或年线位置</p>
    </div>

    <h2>回测结果汇总</h2>
    <table>
      <thead>
        <tr>
          <th>指数</th>
          <th>总收益</th>
          <th>买入持有收益率</th>
          <th>交易次数</th>
          <th>网格间距</th>
          <th>开始日期</th>
          <th>结束日期</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(r => {
    if (r.error) {
      return `
            <tr>
              <td>${r.name}</td>
              <td>–</td>
              <td>–</td>
              <td>–</td>
              <td>–</td>
              <td>–</td>
              <td>–</td>
            </tr>`
    }
    return `
          <tr>
            <td>${r.name}</td>
            <td>${(r.totalReturn * 100).toFixed(2)}%</td>
            <td>${(r.buyAndHoldReturn * 100).toFixed(2)}%</td>
            <td>${r.trades.length - 1}</td>
            <td>${r.gridSpacing}%</td>
            <td>${r.startDate}</td>
            <td>${r.endDate}</td>
          </tr>`
  }).join('')}
      </tbody>
    </table>

    <h2>交易明细</h2>
    ${results.map(r => {
    if (r.error) return ''
    return `
      <div class="index-section">
        <div class="index-header">
          <h3>${r.name}</h3>
          <div class="index-stats">
            基准价: ${r.basePrice.toFixed(2)}, 网格间距: ${r.gridSpacing}%, 初始资金: ${r.initialCapital.toFixed(2)}, 最终资产: ${r.finalAssetValue.toFixed(2)}
          </div>
        </div>
        <h3>价格走势与买卖点</h3>
        <div id="chart-${r.symbol}" class="chart-container"></div>
        <table class="trade-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>价格</th>
              <th>份额</th>
              <th>剩余资金</th>
              <th>网格级别</th>
            </tr>
          </thead>
          <tbody>
            ${r.trades.map(trade => {
      let typeClass = ''
      let typeText = ''
      switch (trade.type) {
        case 'init':
          typeClass = 'init'
          typeText = '初始化'
          break
        case 'buy':
          typeClass = 'buy'
          typeText = '买入'
          break
        case 'sell':
          typeClass = 'sell'
          typeText = '卖出'
          break
      }
      return `
              <tr>
                <td>${trade.date}</td>
                <td class="${typeClass}">${typeText}</td>
                <td>${trade.price.toFixed(2)}</td>
                <td>${trade.position.toFixed(2)}</td>
                <td>${trade.capital.toFixed(2)}</td>
                <td>${trade.level || '-'}</td>
              </tr>`
    }).join('')}
          </tbody>
        </table>
      </div>`
  }).join('')}
    
    <script>
      // 生成图表数据
      ${results.map(r => {
    if (r.error) return ''

    // 提取价格数据和买卖点
    const prices = r.trades.map(trade => trade.price)
    const dates = r.trades.map(trade => trade.date)
    const buyPoints = r.trades.filter(trade => trade.type === 'buy').map(trade => {
      return [dates.indexOf(trade.date), trade.price]
    })
    const sellPoints = r.trades.filter(trade => trade.type === 'sell').map(trade => {
      return [dates.indexOf(trade.date), trade.price]
    })

    return `
        // 初始化${r.name}图表
        const chart${r.symbol.replace(/[^a-zA-Z0-9]/g, '')} = echarts.init(document.getElementById('chart-${r.symbol}'));
        const option${r.symbol.replace(/[^a-zA-Z0-9]/g, '')} = {
          title: {
            text: '${r.name}价格走势与买卖点',
            left: 'center'
          },
          tooltip: {
            trigger: 'axis',
            formatter: function(params) {
              let result = params[0].name + '<br/>';
              params.forEach(function(item) {
                if (item.seriesName === '价格') {
                  result += item.seriesName + ': ' + item.value.toFixed(2) + '<br/>';
                } else if (item.seriesName === '买入') {
                  result += '<span style="color: green;">' + item.seriesName + ': ' + item.value[1].toFixed(2) + '</span><br/>';
                } else if (item.seriesName === '卖出') {
                  result += '<span style="color: red;">' + item.seriesName + ': ' + item.value[1].toFixed(2) + '</span><br/>';
                }
              });
              return result;
            }
          },
          legend: {
            data: ['价格', '买入', '卖出'],
            bottom: 10
          },
          xAxis: {
            type: 'category',
            data: ${JSON.stringify(dates)},
            axisLabel: {
              rotate: 45,
              interval: Math.floor(${dates.length} / 10)
            }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              formatter: '{value}'
            }
          },
          series: [
            {
              name: '价格',
              type: 'line',
              data: ${JSON.stringify(prices)},
              smooth: true,
              lineStyle: {
                width: 2,
                color: '#333'
              },
              itemStyle: {
                color: '#333'
              }
            },
            {
              name: '买入',
              type: 'scatter',
              data: ${JSON.stringify(buyPoints)},
              symbolSize: 8,
              itemStyle: {
                color: 'green'
              }
            },
            {
              name: '卖出',
              type: 'scatter',
              data: ${JSON.stringify(sellPoints)},
              symbolSize: 8,
              itemStyle: {
                color: 'red'
              }
            }
          ]
        };
        chart${r.symbol.replace(/[^a-zA-Z0-9]/g, '')}.setOption(option${r.symbol.replace(/[^a-zA-Z0-9]/g, '')});
        
        // 响应式处理
        window.addEventListener('resize', function() {
          chart${r.symbol.replace(/[^a-zA-Z0-9]/g, '')}.resize();
        });
        `
  }).join('')}
    </script>
  </div>
</body>
</html>
  `

  // 写入HTML文件
  const htmlFilePath = path.join(__dirname, '../gridBacktestReport.html')
  fs.writeFileSync(htmlFilePath, htmlContent)
  console.log(`\n${chalk.green('HTML报告已生成:')} ${htmlFilePath}`)
}

// ─── 执行 ─────────────────────────────────────────────────
if (require.main === module) {
  const showDetail = process.argv.indexOf('--detail') !== -1
  main(showDetail).catch(err => {
    console.error(chalk.red('执行失败:', err))
    process.exit(1)
  })
}

module.exports = { main, backtestGridStrategy }