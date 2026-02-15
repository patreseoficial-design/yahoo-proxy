import axios from "axios";
import cheerio from "cheerio";

export default async function handler(req, res) {
  const ticker = req.query.ticker?.toUpperCase();
  if (!ticker) return res.status(400).json({ error: "Ticker obrigatório" });

  try {
    const url = `https://www.fundamentus.com.br/detalhes.php?papel=${ticker}`;

    const { data: html } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "pt-BR"
      }
    });

    const $ = cheerio.load(html);

    function getValue(label) {
      const cell = $("td")
        .filter((i, el) => $(el).text().trim() === label)
        .next();
      return cell?.text().trim() || null;
    }

    function parseNumber(value) {
      if(!value) return null;
      return parseFloat(value.replace(/\./g, "").replace(",", "."));
    }

    const indicadores = {
      PL: parseNumber(getValue("P/L")),
      PVP: parseNumber(getValue("P/VP")),
      PSR: parseNumber(getValue("PSR")),
      DY: parseNumber(getValue("Dividend Yield")),
      ROE: parseNumber(getValue("ROE")),
      LiquidezCorrente: parseNumber(getValue("Liq. Corr.")),
      MargemBruta: parseNumber(getValue("Marg. Bruta")),
      MargemLiquida: parseNumber(getValue("Marg. Líquida")),
      PassivoPatrimonio: parseNumber(getValue("Passivo/Patrim."))
    };

    const nome = $("#descricao p:first-child").text().trim() || ticker;

    const result = {
      ticker,
      nome,
      fonte: "fundamentus",
      dataCriacao: new Date().toISOString(),
      indicadores
    };

    return res.json({ source: "fundamentus", data: result });

  } catch (err) {
    console.error("Erro raspando Fundamentus:", err.message);
    return res.status(500).json({ error: true, message: err.message });
  }
}