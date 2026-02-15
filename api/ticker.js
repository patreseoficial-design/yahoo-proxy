import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_DAYS = 5;

// garante que a pasta /data exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

function isExpired(updatedAt) {
  const diff =
    (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return diff >= CACHE_DAYS;
}

async function fetchHtml(ticker) {
  const url = `https://statusinvest.com.br/acoes/${ticker.toLowerCase()}`;

  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Referer: "https://www.google.com/"
    },
    timeout: 15000
  });

  return response.data;
}

function parseHtml(html, ticker) {
  const $ = cheerio.load(html);

  const nome = $("h1").first().text().trim();

  const precoTexto = $(".value").first().text().replace(",", ".");
  const preco = parseFloat(precoTexto.replace(/[^\d.]/g, "")) || null;

  return {
    ticker,
    nome,
    preco,
    fonte: "statusinvest",
    atualizadoEm: new Date().toISOString(),
    validoAte: new Date(
      Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()
  };
}

export default async function handler(req, res) {
  const ticker = req.query.ticker?.toUpperCase();

  if (!ticker) {
    return res.status(400).json({ error: "Informe o ticker" });
  }

  const filePath = path.join(DATA_DIR, `${ticker}.json`);

  // 1️⃣ Se já existe JSON
  if (fs.existsSync(filePath)) {
    const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (!isExpired(cached.atualizadoEm)) {
      return res.json({
        source: "cache",
        data: cached
      });
    }
  }

  // 2️⃣ Se não existe ou expirou → raspa de novo
  try {
    const html = await fetchHtml(ticker);
    const parsed = parseHtml(html, ticker);

    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));

    return res.json({
      source: "scraping",
      data: parsed
    });
  } catch (err) {
    return res.json({
      error: true,
      message: err.message
    });
  }
}