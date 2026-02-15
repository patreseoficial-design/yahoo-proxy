import axios from "axios";
import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_DAYS = 5;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function isExpired(updatedAt) {
  const diff =
    (Date.now() - new Date(updatedAt).getTime()) /
    (1000 * 60 * 60 * 24);
  return diff >= CACHE_DAYS;
}

/* =========================
   FUNDAMENTUS – INDICADORES
========================= */
async function fetchFundamentus(ticker) {
  try {
    const url = `https://www.fundamentus.com.br/detalhes.php?papel=${ticker}`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(data);

    function val(label) {
      const el = $("td")
        .filter((_, e) => $(e).text().trim() === label)
        .next();
      return el.text().replace(",", ".").replace("%", "").trim();
    }

    return {
      pl: Number(val("P/L")) || null,
      pvp: Number(val("P/VP")) || null,
      dy: Number(val("Div. Yield")) || null,
      roe: Number(val("ROE")) || null,
      margemLiquida: Number(val("Marg. Líq.")) || null,
      liquidezCorrente: Number(val("Liq. Corr.")) || null,
      dividaLiquidaEbitda: Number(val("Dív. Líq./EBITDA")) || null
    };
  } catch {
    return {};
  }
}

/* =========================
   B3 – DIVIDENDOS OFICIAIS
========================= */
async function fetchB3Dividends(ticker) {
  try {
    const clean = ticker.replace(/[0-9]/g, "");
    const url = `https://sistemaswebb3-listados.b3.com.br/fundsPage/main/38065012000177/${clean}/1/events`;

    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(data);
    const rows = $("table tr");

    const dividends = [];

    rows.each((i, row) => {
      const cols = $(row).find("td");
      if (cols.length >= 6) {
        const tipo = $(cols[0]).text().trim();
        if (tipo === "RENDIMENTO" || tipo === "DIVIDENDO") {
          dividends.push({
            dataBase: $(cols[6]).text().trim(),
            dataPagamento: $(cols[3]).text().trim(),
            valor: Number(
              $(cols[4]).text().replace(",", ".")
            )
          });
        }
      }
    });

    return dividends;
  } catch {
    return [];
  }
}

/* =========================
   PREÇO ATUAL (BÁSICO)
========================= */
async function fetchPrice(ticker) {
  try {
    const url = `https://www.google.com/finance/quote/${ticker}:BVMF`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(data);
    const price = $("div.YMlKec.fxKbKc").first().text();

    return Number(price.replace(",", "."));
  } catch {
    return null;
  }
}

/* =========================
   ENDPOINT PRINCIPAL
========================= */
export default async function handler(req, res) {
  const ticker = req.query.ticker?.toUpperCase();
  if (!ticker)
    return res.status(400).json({ error: "Ticker obrigatório" });

  const filePath = path.join(DATA_DIR, `${ticker}.json`);

  if (fs.existsSync(filePath)) {
    const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!isExpired(cached.meta.atualizadoEm)) {
      return res.json({ source: "cache", data: cached });
    }
  }

  try {
    const indicadores = await fetchFundamentus(ticker);
    const dividendos = await fetchB3Dividends(ticker);
    const precoAtual = await fetchPrice(ticker);

    let historico = [];
    if (fs.existsSync(filePath)) {
      historico = JSON.parse(fs.readFileSync(filePath)).historicoPrecos || [];
    }

    const hoje = new Date().toISOString().slice(0, 10);
    if (precoAtual && !historico.find(h => h.data === hoje)) {
      historico.push({ data: hoje, preco: precoAtual });
    }

    const jsonFinal = {
      ticker,
      nome: ticker,
      tipo: "Ação",
      bolsa: "B3",
      pais: "Brasil",
      preco: {
        atual: precoAtual,
        moeda: "BRL"
      },
      indicadores,
      dividendos,
      historicoPrecos: historico,
      fonte: "fundamentus + b3 + google",
      meta: {
        criadoEm: fs.existsSync(filePath)
          ? JSON.parse(fs.readFileSync(filePath)).meta.criadoEm
          : new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        validoAte: new Date(
          Date.now() + CACHE_DAYS * 86400000
        ).toISOString()
      }
    };

    fs.writeFileSync(filePath, JSON.stringify(jsonFinal, null, 2));
    res.json({ source: "junta-junta", data: jsonFinal });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
}