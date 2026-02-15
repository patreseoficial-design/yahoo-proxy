import axios from "axios";
import cheerio from "cheerio";
import { MongoClient } from "mongodb";

// ---------------- CONFIGURAÇÃO MONGO ----------------
const MONGO_URI = "mongodb+srv://ticker_user:Nagila35971812@cluster0.vzrjwja.mongodb.net/stocks?retryWrites=true&w=majority";
const DB_NAME = "stocks";
const COLLECTION_NAME = "tickers";

// ---------------- USER-AGENTS ----------------
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "Mozilla/5.0 (X11; Linux x86_64)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
];
const getRandomUA = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// ---------------- FUNÇÃO STATUSINVEST ----------------
async function fetchStatusInvest(ticker) {
  const url = `https://statusinvest.com.br/acoes/${ticker.toLowerCase()}`;
  const res = await axios.get(url, {
    headers: { "User-Agent": getRandomUA(), "Accept-Language": "pt-BR", Referer: "https://www.google.com/" },
    timeout: 15000
  });
  const $ = cheerio.load(res.data);

  let nuxtData = {};
  try {
    const nuxtScript = $("script")
      .filter((i, el) => $(el).html()?.includes("window.__NUXT__"))
      .html();
    if (nuxtScript) {
      const jsonText = nuxtScript.match(/window\.__NUXT__\s*=\s*(\{.*\});/)?.[1];
      if (jsonText) nuxtData = JSON.parse(jsonText);
    }
  } catch { nuxtData = {}; }

  const company = nuxtData.company || {};
  const indicators = nuxtData.indicators || {};
  const balance = nuxtData.balanceSheet || {};
  const dividends = nuxtData.dividends || [];
  const historicalPrice = nuxtData.historicalPrice || [];

  const nome = $?.("h1").first().text().trim() || company.name || ticker;

  return {
    ticker,
    nome,
    tipo: company.type || "Ação",
    bolsa: "B3",
    pais: "Brasil",
    url: url,
    indicadores: {
      pl: parseFloat(indicators?.pl || 0),
      pvp: parseFloat(indicators?.pvp || 0),
      dy: parseFloat(indicators?.dy || 0),
      roe: parseFloat(indicators?.roe || 0),
      margemLiquida: parseFloat(indicators?.margemLiquida || 0),
      crescimentoReceita5a: parseFloat(indicators?.crescimentoReceita5a || 0),
      crescimentoLucro5a: parseFloat(indicators?.crescimentoLucro5a || 0)
    },
    balanco: {
      ativoTotal: parseFloat(balance?.ativoTotal || 0),
      passivoTotal: parseFloat(balance?.passivoTotal || 0),
      patrimonioLiquido: parseFloat(balance?.patrimonioLiquido || 0),
      receitaLiquida: parseFloat(balance?.receitaLiquida || 0),
      lucroLiquido: parseFloat(balance?.lucroLiquido || 0),
      ebitda: parseFloat(balance?.ebitda || 0),
      margemBruta: parseFloat(balance?.margemBruta || 0),
      margemLiquida: parseFloat(balance?.margemLiquida || 0),
      dividaLiquida: parseFloat(balance?.dividaLiquida || 0)
    },
    dividendos: dividends.map(d => ({ data: d.date || null, valor: parseFloat(d.value || 0) })),
    historicoPrecos: historicalPrice.map(p => ({ data: p.date || null, preco: parseFloat(p.price || 0) })),
    empresa: {
      setor: company.sector || "",
      subsetor: company.subSector || "",
      fundacao: company.founded || null,
      descricao: company.description || "",
      ceo: company.ceo || "",
      funcionarios: company.employees || 0
    }
  };
}

// ---------------- FUNÇÃO YAHOO FINANCE ----------------
async function fetchYahoo(ticker) {
  try {
    const res = await axios.get(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`);
    const q = res.data.quoteResponse.result[0];
    if (!q) return {};
    return {
      preco: {
        atual: q.regularMarketPrice || 0,
        moeda: q.currency || "BRL",
        variacaoDia: q.regularMarketChange || 0,
        variacaoDiaPct: q.regularMarketChangePercent || 0,
        max52sem: q.fiftyTwoWeekHigh || 0,
        min52sem: q.fiftyTwoWeekLow || 0,
        volume: q.regularMarketVolume || 0
      }
    };
  } catch { return {}; }
}

// ---------------- FUNÇÃO PRINCIPAL ----------------
export default async function handler(req, res) {
  const ticker = req.query.ticker?.toUpperCase();
  if (!ticker) return res.status(400).json({ error: "Ticker obrigatório" });

  try {
    // Pega StatusInvest e Yahoo Finance
    const statusData = await fetchStatusInvest(ticker);
    const yahooData = await fetchYahoo(ticker);

    // Junta tudo em um JSON
    const merged = { ...statusData, ...yahooData, meta: { atualizadoEm: new Date().toISOString() } };

    // Conecta no Mongo
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Upsert
    await collection.updateOne({ ticker }, { $set: merged }, { upsert: true });
    await client.close();

    return res.json({ source: "junta_junta", data: merged });
  } catch (err) {
    console.error("Erro:", err.message);
    return res.status(500).json({ error: true, message: err.message });
  }
}