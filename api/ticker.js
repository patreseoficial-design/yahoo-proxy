import axios from "axios";

export default async function handler(req, res) {
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({
      error: "Informe o ticker. Ex: /api/ticker?ticker=VALE3"
    });
  }

  // URL de TESTE (Status Invest – pode trocar depois)
  const url = `https://statusinvest.com.br/acoes/${ticker.toLowerCase()}`;

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive"
      }
    });

    // ⚠️ Retorna o HTML BRUTO para inspeção
    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      source: "statusinvest",
      fetchedAt: new Date().toISOString(),
      length: response.data?.length || null,
      raw: response.data
    });

  } catch (error) {
    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      source: "statusinvest",
      error: true,
      message: error.message,
      status: error.response?.status || null,
      headers: error.response?.headers || null
    });
  }
}