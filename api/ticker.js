import axios from "axios";
import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_DAYS = 5;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function isExpired(updatedAt) {
  const diff = (Date.now() - new Date(updatedAt).getTime()) / (1000*60*60*24);
  return diff >= CACHE_DAYS;
}

async function fetchHtml(ticker) {
  const url = `https://statusinvest.com.br/acoes/${ticker.toLowerCase()}`;
  const res = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "pt-BR",
      Referer: "https://www.google.com/"
    },
    timeout: 15000
  });
  return res.data;
}

function parseHtml(html, ticker) {
  const $ = cheerio.load(html);

  // Pegar JSON Nuxt embutido
  const nuxtScript = $("script")
    .filter((i, el) => $(el).html().includes("window.__NUXT__"))
    .html();

  let nuxtData = {};
  if (nuxtScript) {
    const jsonText = nuxtScript.match(/window\.__NUXT__\s*=\s*(\{.*\});/)?.[1];
    if (jsonText) nuxtData = JSON.parse(jsonText);
  }

  // Extrair dados principais
  const nome = $("h1").first().text().trim() || nuxtData.company?.name || ticker;

  const preco = parseFloat(
    $(".value").first().text().replace(/[^\d.,]/g, "").replace(",", ".")
  ) || nuxtData.price?.current || null;

  return {
    ticker,
    nome,
    tipo: nuxtData.company?.type || "Ação",
    bolsa: "B3",
    pais: "Brasil",
    preco,
    indicadores: nuxtData.indicators || {},
    dividendos: nuxtData.dividends || {},
    balanco: nuxtData.balanceSheet || {},
    historicoPrecos: nuxtData.historicalPrice || [],
    empresa: {
      setor: nuxtData.company?.sector,
      subsetor: nuxtData.company?.subSector,
      fundacao: nuxtData.company?.founded,
      descricao: nuxtData.company?.description,
      ceo: nuxtData.company?.ceo,
      funcionarios: nuxtData.company?.employees
    },
    fonte: "statusinvest",
    url: `https://statusinvest.com.br/acoes/${ticker.toLowerCase()}`,
    meta: {
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      validoAte: new Date(Date.now()+CACHE_DAYS*24*60*60*1000).toISOString()
    }
  };
}

export default async function handler(req, res) {
  const ticker = req.query.ticker?.toUpperCase();
  if (!ticker) return res.status(400).json({ error: "Ticker obrigatório" });

  const filePath = path.join(DATA_DIR, `${ticker}.json`);

  if (fs.existsSync(filePath)) {
    const cached = JSON.parse(fs.readFileSync(filePath,"utf-8"));
    if (!isExpired(cached.meta.atualizadoEm)) return res.json({ source:"cache", data:cached });
  }

  try {
    const html = await fetchHtml(ticker);
    const parsed = parseHtml(html, ticker);
    fs.writeFileSync(filePath, JSON.stringify(parsed,null,2));
    return res.json({ source:"scraping", data:parsed });
  } catch(err) {
    return res.json({ error:true, message: err.message });
  }
}