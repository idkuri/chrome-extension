const puppeteer = require('puppeteer');

const captureM3U8 = async (url) => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  let checkUrl = []

  page.on('response', async (response) => {
    const responseUrl = response.url();
    if (responseUrl.endsWith(".m3u8")) {
      checkUrl.push(responseUrl);
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2' });

  await browser.close();
  return checkUrl
};

document.addEventListener("DOMContentLoaded", async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const url = tabs[0].url;
      const m3u8Url = await captureM3U8(url);
      document.getElementById("url").textContent = m3u8Url.toString();
    });
  });