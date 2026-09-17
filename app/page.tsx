"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MarketKey = "美股" | "港股" | "韩股" | "期货" | "宏观" | "基金";
type Quote = { symbol: string; name: string; price: string; change: number; signal: "增持" | "观察" | "减持" };

const marketData: Record<MarketKey, Quote[]> = {
  美股: [
    { symbol: "NVDA", name: "NVIDIA", price: "$176.24", change: 2.81, signal: "增持" },
    { symbol: "MSFT", name: "Microsoft", price: "$514.63", change: -0.31, signal: "观察" },
    { symbol: "SPY", name: "标普 500 ETF", price: "$671.42", change: 0.67, signal: "增持" },
    { symbol: "QQQ", name: "纳指 100 ETF", price: "$601.88", change: 1.12, signal: "增持" },
  ],
  港股: [
    { symbol: "0700", name: "腾讯控股", price: "HK$648.50", change: 1.49, signal: "增持" },
    { symbol: "9988", name: "阿里巴巴-W", price: "HK$154.10", change: -0.58, signal: "观察" },
    { symbol: "3690", name: "美团-W", price: "HK$109.40", change: 2.05, signal: "观察" },
    { symbol: "2800", name: "盈富基金", price: "HK$26.72", change: 0.83, signal: "增持" },
  ],
  韩股: [
    { symbol: "005930", name: "三星电子", price: "₩87,200", change: 1.16, signal: "增持" },
    { symbol: "000660", name: "SK 海力士", price: "₩338,500", change: 3.04, signal: "增持" },
    { symbol: "035420", name: "NAVER", price: "₩258,000", change: -0.77, signal: "观察" },
    { symbol: "KODEX", name: "KOSPI 200 ETF", price: "₩49,215", change: 0.61, signal: "增持" },
  ],
  期货: [
    { symbol: "GC", name: "COMEX 黄金", price: "$3,692.8", change: 0.72, signal: "增持" },
    { symbol: "CL", name: "WTI 原油", price: "$66.41", change: -1.23, signal: "减持" },
    { symbol: "NQ", name: "纳指 100 期货", price: "24,911", change: 0.91, signal: "增持" },
    { symbol: "ES", name: "标普 500 期货", price: "6,710", change: 0.45, signal: "观察" },
  ],
  宏观: [
    { symbol: "DXY", name: "美元指数", price: "97.02", change: -0.18, signal: "观察" },
    { symbol: "US10Y", name: "美国 10 年期", price: "4.08%", change: 0.04, signal: "减持" },
    { symbol: "VIX", name: "波动率指数", price: "15.62", change: -2.14, signal: "观察" },
    { symbol: "CN10Y", name: "中国 10 年期", price: "1.91%", change: -0.01, signal: "观察" },
  ],
  基金: [
    { symbol: "VOO", name: "Vanguard S&P 500", price: "$617.09", change: 0.66, signal: "增持" },
    { symbol: "GLD", name: "SPDR Gold Shares", price: "$339.80", change: 0.69, signal: "增持" },
    { symbol: "TLT", name: "20+ 年美债 ETF", price: "$88.44", change: -0.27, signal: "观察" },
    { symbol: "KWEB", name: "中概互联网 ETF", price: "$36.12", change: 1.34, signal: "观察" },
  ],
};

const portfolio = [
  { symbol: "SPY", name: "标普 500 ETF", weight: 34, target: 30, pnl: 5.14, color: "#b8f35d" },
  { symbol: "QQQ", name: "纳指 100 ETF", weight: 18, target: 20, pnl: 3.62, color: "#79d7ff" },
  { symbol: "GLD", name: "黄金 ETF", weight: 15, target: 15, pnl: 1.08, color: "#f7c95c" },
  { symbol: "TLT", name: "长期美债 ETF", weight: 12, target: 10, pnl: -0.48, color: "#ad93ff" },
  { symbol: "KODEX", name: "韩国 200 ETF", weight: 8, target: 9, pnl: 0.73, color: "#ff8b7b" },
  { symbol: "2800", name: "盈富基金", weight: 7, target: 9, pnl: 0.59, color: "#58e0c0" },
  { symbol: "CASH", name: "美元现金", weight: 6, target: 7, pnl: 0, color: "#65727f" },
];

const navItems = [
  { label: "投资总览", id: "overview", icon: "⌂" }, { label: "全球市场", id: "markets", icon: "◎" },
  { label: "策略回测", id: "backtest", icon: "↗" }, { label: "模拟组合", id: "portfolio", icon: "◫" },
  { label: "研究报告", id: "reports", icon: "≡" },
];
const tickers = [["S&P 500", "6,704.12", "+0.64%"], ["恒生指数", "26,349.45", "+1.12%"], ["KOSPI", "3,522.48", "+0.83%"], ["黄金", "$3,692.80", "+0.72%"], ["VIX", "15.62", "−2.14%"]];

function EquityChart({ variant = "portfolio" }: { variant?: "portfolio" | "backtest" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio; canvas.height = rect.height * ratio; ctx.scale(ratio, ratio); ctx.clearRect(0, 0, rect.width, rect.height);
      const values = Array.from({ length: 64 }, (_, i) => 32 + (variant === "portfolio" ? i * .46 : i * .61) + Math.sin(i * .3) * 3.8 + Math.sin(i * .09) * 5 + (i > 36 && i < 44 ? -(9 - Math.abs(40 - i) * 1.8) : 0));
      const min = Math.min(...values) - 3; const max = Math.max(...values) + 3;
      const point = (value: number, i: number) => ({ x: (i / (values.length - 1)) * rect.width, y: rect.height - ((value - min) / (max - min)) * (rect.height - 16) - 8 });
      ctx.strokeStyle = "rgba(143,156,167,.14)"; ctx.lineWidth = 1;
      [.2, .5, .8].forEach(p => { ctx.beginPath(); ctx.moveTo(0, rect.height * p); ctx.lineTo(rect.width, rect.height * p); ctx.stroke(); });
      const gradient = ctx.createLinearGradient(0, 0, 0, rect.height); gradient.addColorStop(0, variant === "portfolio" ? "rgba(184,243,93,.28)" : "rgba(121,215,255,.25)"); gradient.addColorStop(1, "rgba(11,15,17,0)");
      ctx.beginPath(); values.forEach((value, i) => { const p = point(value, i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.lineTo(rect.width, rect.height); ctx.lineTo(0, rect.height); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath(); values.forEach((value, i) => { const p = point(value, i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.strokeStyle = variant === "portfolio" ? "#b8f35d" : "#79d7ff"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    };
    draw(); window.addEventListener("resize", draw); return () => window.removeEventListener("resize", draw);
  }, [variant]);
  return <canvas ref={ref} className="equity-canvas" aria-label="组合净值曲线" />;
}

function Sparkline({ positive = true, seed = 0 }: { positive?: boolean; seed?: number }) {
  const bars = Array.from({ length: 18 }, (_, i) => 22 + ((i * 13 + seed * 9) % 28) + (positive ? i * 1.2 : (18 - i) * .7));
  return <div className={`sparkline ${positive ? "positive" : "negative"}`} aria-hidden="true">{bars.map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div>;
}

export default function Home() {
  const [market, setMarket] = useState<MarketKey>("美股"); const [capital, setCapital] = useState(1000);
  const [strategy, setStrategy] = useState("多因子轮动"); const [risk, setRisk] = useState("平衡"); const [running, setRunning] = useState(false);
  const [backtestReady, setBacktestReady] = useState(true); const [weightsApplied, setWeightsApplied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false); const [toast, setToast] = useState(""); const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => { const saved = window.localStorage.getItem("atlas-sim-capital"); if (saved && Number(saved) > 0) setCapital(Number(saved)); }, []);
  useEffect(() => { window.localStorage.setItem("atlas-sim-capital", String(capital)); }, [capital]);

  const totalValue = capital * 1.00742, todayPnl = capital * .00742;
  const maxDrawdown = risk === "进取" ? "−12.6%" : risk === "保守" ? "−4.2%" : "−7.8%";
  const annualized = strategy === "趋势跟随" ? "16.2%" : strategy === "均值回归" ? "12.1%" : "18.7%";
  const sharpe = strategy === "趋势跟随" ? "1.42" : strategy === "均值回归" ? "1.28" : "1.61";
  const scaledPortfolio = useMemo(() => portfolio.map(item => ({ ...item, value: totalValue * (item.weight / 100), pnl: item.pnl * (capital / 1000) })), [capital, totalValue]);
  const goTo = (id: string) => { setActiveSection(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); };
  const runBacktest = () => { setRunning(true); setBacktestReady(false); window.setTimeout(() => { setRunning(false); setBacktestReady(true); notify(`${strategy}回测完成 · 已生成 1,248 个交易日结果`); }, 850); };
  const applyWeights = () => { setWeightsApplied(true); notify("模拟调仓方案已保存，将在下一个交易日开盘价执行"); };
  const downloadReport = () => {
    const report = `# ATLAS 模拟投资研究简报\n\n生成时间：2026-09-17\n策略：${strategy}\n风险偏好：${risk}\n模拟本金：$${capital.toLocaleString()}\n\n## 核心结论\n全球风险资产动能保持正向，但利率敏感资产仍需控制久期暴露。模型建议小幅降低 SPY 与 TLT，增加 QQQ、韩国半导体及港股宽基的分散配置。\n\n## 回测摘要\n- 年化收益：${annualized}\n- 夏普比率：${sharpe}\n- 最大回撤：${maxDrawdown}\n\n> 本报告仅供研究与模拟，不构成投资建议或收益承诺。`;
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "atlas-research-brief.md"; link.click(); URL.revokeObjectURL(link.href);
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => goTo("overview")} aria-label="返回投资总览"><span className="brand-mark">A</span><span><b>ATLAS</b><small>QUANT LAB</small></span></button>
      <nav aria-label="主导航"><p className="nav-label">WORKSPACE</p>{navItems.map(item => <button key={item.id} className={activeSection === item.id ? "active" : ""} onClick={() => goTo(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot"><div className="status-line"><i /> 模拟引擎在线</div><button onClick={() => notify("数据设置将在正式接入行情 API 后开放")}>⚙ 数据与设置</button><div className="profile"><span>LL</span><div><b>研究员账户</b><small>Paper trading</small></div></div></div>
    </aside>
    <main>
      <div className="ticker-tape" aria-label="市场指数摘要"><span className="live-label"><i /> DEMO DATA</span><div className="ticker-track">{tickers.map(([name, value, change]) => <span key={name}><b>{name}</b> {value} <em className={change.startsWith("+") ? "up" : "down"}>{change}</em></span>)}</div><span className="utc">UTC+8 · 21:42</span></div>
      <div className="content">
        <section id="overview" className="section-anchor hero-row"><div><span className="eyebrow">SIMULATED PORTFOLIO / 01</span><h1>晚上好，研究员。</h1><p>市场仍在交易，组合风险敞口保持在目标区间。</p></div><div className="hero-actions"><button className="ghost-button" onClick={() => setReportOpen(true)}>查看今日简报</button><button className="primary-button" onClick={() => goTo("portfolio")}>调整模拟资金 ↗</button></div></section>

        <section className="metric-grid" aria-label="组合核心指标">
          <article className="metric-card featured"><div className="metric-head"><span>模拟总资产</span><span className="paper-badge">PAPER</span></div><strong>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><div className="metric-foot"><span className="up">+${todayPnl.toFixed(2)} <small>今日</small></span><span>本金 ${capital.toLocaleString()}</span></div></article>
          <article className="metric-card"><div className="metric-head"><span>今日收益率</span><span>1D</span></div><strong className="up">+0.74%</strong><div className="metric-foot"><span>胜率 61.8%</span><Sparkline positive seed={1} /></div></article>
          <article className="metric-card"><div className="metric-head"><span>近 30 日</span><span>30D</span></div><strong className="up">+4.86%</strong><div className="metric-foot"><span>超额 +1.92%</span><Sparkline positive seed={4} /></div></article>
          <article className="metric-card"><div className="metric-head"><span>组合风险</span><span>95% VaR</span></div><strong>−1.38%</strong><div className="metric-foot"><span className="risk-low">● 偏低</span><span>β 0.76</span></div></article>
        </section>

        <section className="dashboard-grid">
          <article className="panel performance-panel"><div className="panel-header"><div><span className="eyebrow">PERFORMANCE</span><h2>组合净值</h2></div><div className="range-switch" role="group" aria-label="净值周期"><button>1W</button><button className="active">1M</button><button>3M</button><button>1Y</button></div></div><div className="chart-summary"><div><small>策略净值</small><b>1.0486</b></div><div><small>基准净值</small><b>1.0294</b></div><span className="legend"><i /> 策略 <i /> 基准</span></div><div className="equity-wrap"><EquityChart /></div><div className="chart-axis"><span>8月18日</span><span>8月25日</span><span>9月1日</span><span>9月8日</span><span>今天</span></div></article>
          <article className="panel signal-panel"><div className="panel-header"><div><span className="eyebrow">MODEL SIGNAL</span><h2>今日量化信号</h2></div><span className="confidence">置信度 78%</span></div><div className="signal-score"><span>+0.62</span><small>RISK-ON</small></div><div className="signal-meter"><i style={{ width: "78%" }} /></div><p className="signal-copy">盈利动能与市场宽度支持适度增加风险资产，但实际利率仍对久期形成约束。</p><div className="signal-actions"><div><span>增持</span><b>QQQ · KODEX 200</b></div><div><span>减持</span><b>TLT · 美元现金</b></div></div><button className="text-button" onClick={() => setReportOpen(true)}>查看模型解释 →</button></article>
        </section>

        <section id="markets" className="section-anchor panel market-panel">
          <div className="panel-header market-title-row"><div><span className="eyebrow">GLOBAL MARKETS / 02</span><h2>跨市场观察池</h2><p>统一观察不同币种资产的价格、动量与模型信号。</p></div><span className="data-note">示范行情 · 非实时</span></div>
          <div className="market-tabs" role="tablist" aria-label="选择市场">{(Object.keys(marketData) as MarketKey[]).map(key => <button key={key} role="tab" aria-selected={market === key} className={market === key ? "active" : ""} onClick={() => setMarket(key)}>{key}</button>)}</div>
          <div className="quote-table" role="table" aria-label={`${market}行情`}><div className="quote-head" role="row"><span>标的</span><span>最新价</span><span>日涨跌</span><span>微趋势</span><span>模型</span></div>{marketData[market].map((quote, index) => <button className="quote-row" role="row" key={quote.symbol} onClick={() => notify(`${quote.symbol} 已加入研究工作区`)}><span className="asset-cell"><b>{quote.symbol}</b><small>{quote.name}</small></span><strong>{quote.price}</strong><span className={quote.change >= 0 ? "up" : "down"}>{quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)}%</span><Sparkline positive={quote.change >= 0} seed={index + market.length} /><span className={`signal-tag ${quote.signal}`}>{quote.signal}</span></button>)}</div>
        </section>

        <section id="backtest" className="section-anchor two-col-section">
          <article className="panel backtest-config"><span className="eyebrow">BACKTEST LAB / 03</span><h2>策略回测实验室</h2><p className="panel-intro">用滚动窗口测试策略，默认计入手续费、滑点与换手约束。</p><label>策略模板<select value={strategy} onChange={e => setStrategy(e.target.value)}><option>多因子轮动</option><option>趋势跟随</option><option>均值回归</option></select></label><div className="field-row"><label>训练区间<select defaultValue="5年"><option>3年</option><option>5年</option><option>10年</option></select></label><label>换仓频率<select defaultValue="每月"><option>每周</option><option>每月</option><option>每季</option></select></label></div><label>风险偏好<div className="segmented">{["保守", "平衡", "进取"].map(item => <button type="button" key={item} className={risk === item ? "active" : ""} onClick={() => setRisk(item)}>{item}</button>)}</div></label><div className="cost-row"><span>交易成本 0.10%</span><span>滑点 0.05%</span><span>无未来数据</span></div><button className="primary-button wide" onClick={runBacktest} disabled={running}>{running ? "正在滚动回测…" : "运行回测 →"}</button></article>
          <article className={`panel backtest-results ${running ? "loading" : ""}`}><div className="panel-header"><div><span className="eyebrow">RESULTS</span><h2>{strategy}</h2></div><span className="verified">✓ 样本外验证</span></div><div className="backtest-metrics"><div><small>年化收益</small><b className="up">{backtestReady ? annualized : "—"}</b></div><div><small>夏普比率</small><b>{backtestReady ? sharpe : "—"}</b></div><div><small>最大回撤</small><b className="down">{backtestReady ? maxDrawdown : "—"}</b></div><div><small>年化波动</small><b>{backtestReady ? "11.6%" : "—"}</b></div></div><div className="equity-wrap compact"><EquityChart variant="backtest" /></div><div className="benchmark-note"><span><i /> 策略</span><span><i /> 60/40 基准</span><span>2019 — 2026</span></div></article>
        </section>

        <section id="portfolio" className="section-anchor panel portfolio-panel">
          <div className="panel-header portfolio-heading"><div><span className="eyebrow">PAPER ALLOCATION / 04</span><h2>模拟资金配置</h2><p>优化目标为风险调整后收益，不代表或保证绝对收益最大化。</p></div><div className="capital-control"><label htmlFor="capital">初始模拟本金</label><div><span>$</span><input id="capital" type="number" min="100" step="100" value={capital} onChange={e => setCapital(Math.max(100, Number(e.target.value) || 100))} /></div></div></div>
          <div className="allocation-layout"><div className="allocation-list"><div className="allocation-head"><span>资产</span><span>当前 / 目标</span><span>市值</span><span>今日盈亏</span></div>{scaledPortfolio.map(item => <div className="allocation-row" key={item.symbol}><span className="asset-cell"><i style={{ background: item.color }} /><b>{item.symbol}</b><small>{item.name}</small></span><span className="weight-cell"><b>{weightsApplied ? item.target : item.weight}%</b><small>→ {item.target}%</small><i><em style={{ width: `${weightsApplied ? item.target : item.weight}%`, background: item.color }} /></i></span><strong>${item.value.toFixed(2)}</strong><span className={item.pnl >= 0 ? "up" : "down"}>{item.pnl >= 0 ? "+" : ""}${item.pnl.toFixed(2)}</span></div>)}</div>
          <aside className="rebalance-card"><span className="eyebrow">NEXT REBALANCE</span><h3>建议下次开盘调仓</h3><p>模型建议卖出约 <b>${(capital * .06).toFixed(0)}</b> 的 SPY / TLT，并将资金分配给 QQQ、韩国与港股宽基。</p><div className="trade-list"><span><i className="sell">卖</i> SPY <b>−4.0%</b></span><span><i className="sell">卖</i> TLT <b>−2.0%</b></span><span><i className="buy">买</i> QQQ <b>+2.0%</b></span><span><i className="buy">买</i> 亚洲宽基 <b>+3.0%</b></span><span><i className="buy">留</i> 现金 <b>+1.0%</b></span></div><button className="primary-button wide" onClick={applyWeights} disabled={weightsApplied}>{weightsApplied ? "已保存调仓计划 ✓" : "采用模拟调仓方案"}</button><small className="simulation-note">仅更新模拟账本，不会发出真实订单。</small></aside></div>
        </section>

        <section id="reports" className="section-anchor reports-section"><div className="section-heading"><div><span className="eyebrow">RESEARCH / 05</span><h2>研究与归因</h2></div><button className="ghost-button" onClick={() => setReportOpen(true)}>打开最新研报</button></div><div className="report-grid"><button className="report-card lead" onClick={() => setReportOpen(true)}><span className="report-type">每日策略简报 · 8 分钟阅读</span><h3>流动性改善，但别忽略利率的第二次冲击</h3><p>模型为何继续偏好科技、黄金与亚洲宽基，以及组合如何降低尾部风险。</p><span className="report-link">阅读报告 →</span></button><button className="report-card" onClick={() => setReportOpen(true)}><span className="report-type">归因分析</span><h3>本月超额收益从哪里来？</h3><p>行业选择贡献 1.21%，择时贡献 0.48%。</p><span className="report-link">查看归因 →</span></button><button className="report-card" onClick={() => setReportOpen(true)}><span className="report-type">模型笔记</span><h3>避免回测过拟合的 6 条规则</h3><p>滚动样本、成本约束与参数稳定性检查。</p><span className="report-link">查看方法 →</span></button></div></section>
        <footer><span>ATLAS QUANT LAB · SIMULATION ONLY</span><p>示范数据仅用于产品原型。回测不代表未来表现，本产品不构成投资建议。</p></footer>
      </div>
    </main>

    <nav className="mobile-nav" aria-label="移动端导航">{navItems.map(item => <button key={item.id} onClick={() => goTo(item.id)} className={activeSection === item.id ? "active" : ""}><span>{item.icon}</span>{item.label.slice(0, 2)}</button>)}</nav>
    {reportOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setReportOpen(false)}><article className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={e => e.stopPropagation()}><div className="modal-top"><span className="paper-badge">AI RESEARCH · 已审核</span><button aria-label="关闭研报" onClick={() => setReportOpen(false)}>×</button></div><span className="eyebrow">DAILY BRIEF · 2026.09.17</span><h2 id="report-title">流动性改善，但别忽略利率的第二次冲击</h2><p className="report-deck">全球风险偏好回暖，多因子模型维持轻度 Risk-on。组合适合提高高质量成长和亚洲宽基配置，同时保留黄金作为尾部保护。</p><div className="report-callout"><b>一句话结论</b><p>提高 QQQ、KODEX 200 与 2800.HK 合计 5%，降低 SPY 与 TLT 合计 6%，现金增加 1%。</p></div><h3>模型观察</h3><p>过去 20 个交易日，盈利修正、价格动量和市场宽度三个信号同步转正；但实际利率处于偏高分位，长久期债券的风险回报仍不理想。</p><div className="modal-metrics"><span><small>风险状态</small><b>轻度 Risk-on</b></span><span><small>置信度</small><b>78%</b></span><span><small>再平衡</small><b>下个开盘</b></span></div><div className="modal-actions"><button className="ghost-button" onClick={downloadReport}>下载 Markdown</button><button className="primary-button" onClick={() => { setReportOpen(false); goTo("portfolio"); }}>查看模拟调仓</button></div><small className="modal-disclaimer">本报告基于示范数据自动生成，仅用于研究与模拟，不构成投资建议。</small></article></div>}
    {toast && <div className="toast" role="status"><i /> {toast}</div>}
  </div>;
}
