const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '10mb' }));

let browser;

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

    if (format === 'base64') {
      res.json({ image: screenshot.toString('base64'), contentType: 'image/png' });
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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Puppeteer renderer escuchando en puerto ${PORT}`);
});
