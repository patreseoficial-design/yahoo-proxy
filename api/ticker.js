import axios from "axios";
import cheerio from "cheerio";

let cache = {}; // cache em memória (funciona por cold start)

const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: "Informe o ticker" });

  const upperTicker = ticker.toUpperCase();

  // Verifica cache
  const cached = cache[upperTicker];
  const now = Date.now();

  if (cached && (now - cached.timestamp) < FIVE_DAYS) {
    return res.status(200).json({ source: "cache", data: cached.data });
  }

  try {
    // Scraping Status Invest
    const url = `https://statusinvest.com.br/acoes/${upperTicker}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Exemplo: pegar preço, dividend yield e setor
    const price = $("div.price span").first().text().trim();
    const dy = $("div#tab-financials div div:contains('Dividend Yield')").next().text().trim();
    const sector = $("a[href*='/setor/']").first().text().trim();
    const segment = $("a[href*='/subsetor/']").first().text().trim();

    const data = {
      ticker: upperTicker,
      price,
      dividend_yield: dy,
      sector,
      segment,
      last_updated: new Date().toISOString()
    };

    // Salva no cache
    cache[upperTicker] = { data, timestamp: now };

    res.status(200).json({ source: "scraping", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}