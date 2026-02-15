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

    // Indicadores via tabela
    function getValue(label) {
      const cell = $("td")
        .filter((i, el) => $(el).text().trim() === label)
        .next();
      return cell.text().trim();
    }

    const indicadores = {
      PL: getValue("P/L"),
      PVP: getValue("P/VP"),
      PSR: getValue("PSR"),
      DY: getValue("Dividend Yield"),
      ROE: getValue("ROE"),
      LiquidezCorrente: getValue("Liq. Corr."),
      MargemBruta: getValue("Marg. Bruta"),
      MargemLiquida: getValue("Marg. Líquida"),
      PassivoPatrimonio: getValue("Passivo/Patrim."),
      // outros que achar relevante
    };

    // Nome completo da empresa no topo
    const nome = $("#descricao p:nth-child(1)").text().trim() || ticker;

    const result = {
      ticker,
      nome,
      fonte: "fundamentus",
      indicadores
    };

    return res.json({ source: "fundamentus", data: result });

  } catch (err) {
    console.error("Erro raspando Fundamentus:", err.message);
    return res.status(500).json({ error: true, message: err.message });
  }
}