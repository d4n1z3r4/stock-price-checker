'use strict';

const https = require('https');
const crypto = require('crypto');
const cors = require('cors');

const PROXY_BASE = 'https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock';
const likesByStock = new Map();
const likedByIp = new Set();

function anonymizeIp(ip) {
  // Hash the IP before it is used as an identifier; raw IPs are never stored.
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex');
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        timeout: 7000,
        headers: {
          accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
        }
      },
      response => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });

        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            return reject(
              new Error(`HTTP ${response.statusCode} ao consultar ${url}`)
            );
          }

          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error('A API retornou JSON inválido'));
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Tempo limite da requisição excedido'));
    });

    request.on('error', reject);
  });
}


async function getYahooPrice(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

  const data = await getJson(url);
  const result = data?.chart?.result?.[0];

  const price = Number(
    result?.meta?.regularMarketPrice ??
    result?.indicators?.quote?.[0]?.close?.filter(Number.isFinite).at(-1)
  );

  if (!Number.isFinite(price)) {
    throw new Error(`No valid Yahoo Finance price for ${symbol}`);
  }

  return price;
}

async function getStock(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized)) {
    throw new Error('Invalid stock symbol');
  }

  const url =
    `${PROXY_BASE}/${encodeURIComponent(normalized)}/quote`;

  try {
    const quote = await getJson(url);
    const rawPrice = quote?.latestPrice ?? quote?.price;
    const price = Number(rawPrice);

    if (
      rawPrice !== null &&
      rawPrice !== undefined &&
      rawPrice !== '' &&
      Number.isFinite(price)
    ) {
      return { stock: normalized, price };
    }

    console.warn(
      `Proxy returned no valid price for ${normalized}; trying Yahoo Finance`
    );
  } catch (err) {
    console.warn(
      `Proxy request failed for ${normalized}: ${err.message}; trying Yahoo Finance`
    );
  }

  const price = await getYahooPrice(normalized);
  return { stock: normalized, price };
}

module.exports = function (app) {
  app.get('/api/stock-prices', cors(), async function (req, res) {
    const rawStocks = req.query.stock;
    const stocks = (Array.isArray(rawStocks) ? rawStocks : [rawStocks])
      .filter(Boolean)
      .slice(0, 2);

    if (stocks.length < 1) {
      return res.status(400).json({ error: 'Provide a stock query parameter.' });
    }

    try {
      const ipKey = anonymizeIp(req.ip);
      const shouldLike = String(req.query.like).toLowerCase() === 'true';

      // Fetch quotes concurrently. Keep the stock order requested by the client.
      const stockData = await Promise.all(stocks.map(async symbol => {
        const stock = await getStock(symbol);
        const key = stock.stock;

        if (!likesByStock.has(key)) likesByStock.set(key, 0);
        if (shouldLike) {
          const likeKey = `${ipKey}:${key}`;
          if (!likedByIp.has(likeKey)) {
            likedByIp.add(likeKey);
            likesByStock.set(key, likesByStock.get(key) + 1);
          }
        }

        return { ...stock, likes: likesByStock.get(key) };
      }));

      if (stockData.length === 1) {
        return res.json({ stockData: stockData[0] });
      }

      const difference = stockData[0].likes - stockData[1].likes;
      return res.json({
        stockData: stockData.map(item => {
          const { likes, ...publicData } = item;
          return { ...publicData, rel_likes: difference * (item.stock === stockData[0].stock ? 1 : -1) };
        })
      });
    } catch (err) {
      console.error('Stock API error:', err.message);
      return res.status(502).json({ error: 'Unable to retrieve stock prices. Please try again.' });
    }
  });
};
