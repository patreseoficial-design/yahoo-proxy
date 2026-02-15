import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  const { ticker } = req.query;

  if (!ticker) return res.status(400).json({ error: "Informe o ticker" });

  try {
    const data = await yahooFinance.quoteSummary(ticker.toUpperCase(), {
      modules: ["price","summaryDetail","financialData","defaultKeyStatistics","summaryProfile"]
    });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}