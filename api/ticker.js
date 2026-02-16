import axios from "axios";
import cheerio from "cheerio";
import { MongoClient } from "mongodb";

// CONFIGURAÇÃO MONGO
const MONGO_URI = "mongodb+srv://ticker_user:Nagila35971812@cluster0.vzrjwja.mongodb.net/stocks?retryWrites=true&w=majority";
const DB_NAME = "stocks";
const COLLECTION_NAME = "tickers";

// Buscar HTML do Fundamentus
async function fetchHtml() {
  const url = `https://www.fundamentus.com.br/resultado.php`;
  const res = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept-Language": "pt-BR"
    },
    timeout: 15000
  });
  return res.data;
}

// Parse HTML e extrair tabela
function parseHtml(html) {
  const $ = cheerio.load(html);
  const tickers = [];

  $("#resultado tbody tr").each((i, el) => {
    const cols = $(el).find("td");
    if (cols.length < 12) return; // ignorar linhas incompletas

    tickers.push({
      papel: $(cols[0]).text().trim(),
      cotacao: parseFloat($(cols[1]).text().replace(".", "").replace(",", ".")) || 0,
      pl: parseFloat($(cols[2]).text().replace(",", ".")) || 0,
      pvp: parseFloat($(cols[3]).text().replace(",", ".")) || 0,
      psr: parseFloat($(cols[4]).text().replace(",", ".")) || 0,
      dy: parseFloat($(cols[5]).text().replace(",", ".")) || 0,
      roe: parseFloat($(cols[6]).text().replace(",", ".")) || 0,
      liquidezCorrente: parseFloat($(cols[7]).text().replace(",", ".")) || 0,
      margemBruta: parseFloat($(cols[8]).text().replace(",", ".")) || 0,
      margemLiquida: parseFloat($(cols[9]).text().replace(",", ".")) || 0,
      passivoPatrimonio: parseFloat($(cols[10]).text().replace(",", ".")) || 0,
      empresa: $(cols[11]).text().trim()
    });
  });

  return tickers;
}

// Salvar no MongoDB
async function saveToMongo(tickers) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  for (const ticker of tickers) {
    await collection.updateOne(
      { papel: ticker.papel },
      { $set: ticker },
      { upsert: true }
    );
  }

  await client.close();
}

// Handler Vercel
export default async function handler(req, res) {
  try {
    const html = await fetchHtml();
    const tickers = parseHtml(html);
    await saveToMongo(tickers);
    res.status(200).json({ success: true, total: tickers.length });
  } catch (err) {
    console.error("Erro scraping Fundamentus:", err.message);
    res.status(500).json({ error: true, message: err.message });
  }
}