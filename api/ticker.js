import axios from "axios";
import cheerio from "cheerio";
import { MongoClient } from "mongodb";

// CONFIGURAÇÃO MONGO
const MONGO_URI = "mongodb+srv://ticker_user:Nagila35971812@cluster0.vzrjwja.mongodb.net/stocks?retryWrites=true&w=majority";
const DB_NAME = "stocks";
const COLLECTION_NAME = "tickers";

// Lista de User-Agents para reduzir bloqueios
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "Mozilla/5.0 (X11; Linux x86_64)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
];

function getRandomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Buscar HTML da Status Invest
async function fetchHtml(ticker) {
  const url = `https://statusinvest.com.br/acoes/${ticker.toLowerCase()}`;
  const res = await axios.get(url, {
    headers: {
      "User-Agent": getRandomUA(),
      "Accept-Language": "pt-BR",
      Referer: "https://www.google.com/"
    },
    timeout: 15000
  });
  return res.data;
}

// Parse do HTML e extração de dados
function parseHtml(html, ticker) {
  let $;
  try {
    $ = cheerio.load(html);
  } catch (e) {
    $ = null;
  }

  let nuxtData = {};
  try {
    if ($) {
      const nuxtScript = $("script")
        .filter((i, el) => $(el).html()?.includes("window.__NUXT__"))
        .html();

      if (nuxtScript) {
        const jsonText = nuxtScript.match(/window\.__NUXT__\s*=\s*(\{.*\});/)?.[1];
        if (jsonText) nuxtData = JSON.parse(jsonText);
      }
    }
  } catch (e) {
    nuxtData = {};
  }

  const company = nuxtData.company || {};
  const indicators = nuxtData.indicators || {};
  const balance = nuxtData.balanceSheet || {};
  const dividends = nuxtData.dividends || [];
  const historicalPrice = nuxtData.historicalPrice || [];

  const nome = $?.("h1").first().text().trim() || company.name || ticker;
  const preco = parseFloat(
    $?.(".value").first().text().replace(/[^\d.,]/g, "").replace(",", ".") || nuxtData.price?.current || 0
  );

  return {
    ticker,
    nome,
    tipo: company.type || "Ação",
    bolsa: "B3",
    pais: "Brasil",
    url: `https://statusinvest.com.br/acoes/${ticker.toLowerCase()}`,
    preco: {
      atual: preco,
      moeda: "BRL",
      variacaoDia: parseFloat(indicators?.variacaoDia || 0),
      variacaoDiaPct: parseFloat(indicators?.variacaoDiaPct || 0),
      min52sem: parseFloat(indicators?.min52sem || 0),
      max52sem: parseFloat(indicators?.max52sem || 0)
    },
    indicadores: {
      pl: parseFloat(indicators?.pl || 0),
      pvp: parseFloat(indicators?.pvp || 0),
      dy: parseFloat(indicators?.dy || 0),
      roe: parseFloat(indicators?.roe || 0),
      margemLiquida: parseFloat(indicators?.margemLiquida || 0),
      ebitda: parseFloat(balance?.ebitda || 0),
      dividaLiquidaEbitda: parseFloat(balance?.dividaLiquidaEbitda || 0),
      liquidezCorrente: parseFloat(balance?.liquidezCorrente || 0),
      crescimentoReceita5a: parseFloat(indicators?.crescimentoReceita5a || 0),
      crescimentoLucro5a: parseFloat(indicators?.crescimentoLucro5a || 0)
    },
    dividendos: dividends.map(d => ({
      data: d.date || null,
      valor: parseFloat(d.value || 0)
    })),
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
    historicoPrecos: historicalPrice.map(p => ({
      data: p.date || null,
      preco: parseFloat(p.price || 0)
    })),
    empresa: {
      setor: company.sector || "",
      subsetor: company.subSector || "",
      fundacao: company.founded || null,
      descricao: company.description || "",
      ceo: company.ceo || "",
      funcionarios: company.employees || 0
    },
    fonte: "statusinvest",
    meta: {
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    }
  };
}

// Função principal para salvar no MongoDB
export default async function handler(req, res) {
  const ticker = req.query.ticker?.toUpperCase();
  if (!ticker) return res.status(400).json({ error: "Ticker obrigatório" });

  try {
    const html = await fetchHtml(ticker);
    const parsed = parseHtml(html, ticker);

    // Conecta no Mongo
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Upsert: atualiza se existir, cria se não
    await collection.updateOne(
      { ticker: parsed.ticker },
      { $set: parsed },
      { upsert: true }
    );

    await client.close();

    return res.json({ source: "scraping", data: parsed });
  } catch (err) {
    console.error("Erro ao raspar ou salvar MongoDB:", err.message);
    return res.status(500).json({ error: true, message: err.message });
  }
}