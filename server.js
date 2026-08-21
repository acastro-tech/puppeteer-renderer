const express = require('express');
const puppeteer = require('puppeteer');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' }));

let browser;
const imageCache = new Map();

// Limpieza de imágenes temporales cada minuto (expiran a los 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, { timestamp }] of imageCache) {
    if (now - timestamp > 5 * 60 * 1000) imageCache.delete(key);
  }
}, 60 * 1000);

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

app.post('/screenshot', async (req, res) => {
  const { html, width = 1080, height = 1080, format } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'El campo "html" es obligatorio' });
  }

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    const screenshot = Buffer.from(raw);

    const id = crypto.randomUUID();
    imageCache.set(id, { data: screenshot, timestamp: Date.now() });
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    if (format === 'base64') {
      res.json({ image: screenshot.toString('base64'), contentType: 'image/png', url: `${baseUrl}/images/${id}` });
    } else if (format === 'url') {
      res.json({ url: `${baseUrl}/images/${id}`, contentType: 'image/png' });
    } else {
      res.set('Content-Type', 'image/png');
      res.send(screenshot);
    }
  } catch (err) {
    console.error('Error generando screenshot:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.get('/images/:id', (req, res) => {
  const entry = imageCache.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Image not found or expired' });
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(entry.data);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Puppeteer renderer escuchando en puerto ${PORT}`);
});
