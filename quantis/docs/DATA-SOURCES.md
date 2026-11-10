# Data sources (all verified reachable from a browser, Nov 2026)

| Source | Key | Used for |
|---|---|---|
| CNBC market data | none | quotes, daily & intraday bars (1m–1M) for stocks, ETFs, indices, FX, crypto, commodities |
| TradingView screener | none | statements & ratios (~70k companies), peers, screener; preferred shares, ETFs, funds; 166k corporate bonds & debentures; government bonds; 52k futures; option chains with IV & Greeks; 2.4k crypto assets; FX |
| CoinGecko | optional demo key | crypto profile, supply, ATH/ATL, history, developer & community data |
| DefiLlama | none | DeFi TVL by chain / protocol |
| Coinbase Exchange | none | crypto price cross-check |
| mempool.space | none | Bitcoin fees, hashrate, difficulty |
| Wikidata / Wikipedia | none | founded, HQ, CEO, founders, industry, website, ISIN; descriptions |
| mfapi.in (AMFI) | none | every Indian mutual-fund scheme, full NAV history |
| Frankfurter (ECB) · ExchangeRate-API | none | FX reference rates & history |
| World Bank · BLS · DBnomics · CFTC · US Treasury | none | macro |
| CNBC news search | none | headlines |
| Pollinations | none | free LLM for AI Lab |
| Financial Modeling Prep · Alpha Vantage · Finnhub | free key | exact statement line items, quarterly cash flows |
| Groq · Gemini · OpenRouter | free key | faster AI |
| Your own APIs | yours | any HTTPS JSON endpoint (Data Sources → Your own APIs) |

Not usable from a browser (blocked by the provider's CORS policy): SEC EDGAR, Yahoo Finance, IMF, ECB SDW,
GDELT, Binance (geo-restricted), OpenFIGI. They work through a user-configured CORS proxy (Settings).
