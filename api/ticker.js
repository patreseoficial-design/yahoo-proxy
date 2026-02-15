import axios from "axios";
import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_DAYS = 5;

// Cria pasta de cache se não existir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function isExpired(updatedAt) {
  const diff = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return diff >= CACHE_DAYS;
}

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
    console.warn("Cheerio não conseguiu carregar HTML:", e.message);
    $ = null;
  }

  // Pegar JSON Nuxt embutido
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
    console.warn("Nuxt JSON não pôde ser lido:", e.message);
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

  // Estrutura final do JSON
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
      atualizadoEm: new Date().toISOString(),
      validoAte: new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    }
  };
}

// Endpoint da API
export default async function handler(req, res) {
  const ticker = req.query.ticker?.toUpperCase();
  if (!ticker) return res.status(400).json({ error: "Ticker obrigatório" });

  const filePath = path.join(DATA_DIR, `${ticker}.json`);

  // Retorna cache se ainda válido
  if (fs.existsSync(filePath)) {
    const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!isExpired(cached.meta.atualizadoEm)) return res.json({ source: "cache", data: cached });
  }

  try {
    const html = await fetchHtml(ticker);
    const parsed = parseHtml(html, ticker);

    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));
    return res.json({ source: "scraping", data: parsed });
  } catch (err) {
    console.error("Erro ao raspar:", err.message);
    // Retorna estrutura vazia mesmo com erro
    return res.json({
      error: true,
      message: err.message,
      data: {
        ticker,
        nome: ticker,
        preco: {},
        indicadores: {},
        balanco: {},
        dividendos: [],
        historicoPrecos: [],
        empresa: {},
        fonte: "statusinvest",
        meta: {
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
          validoAte: new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    });
  }
}