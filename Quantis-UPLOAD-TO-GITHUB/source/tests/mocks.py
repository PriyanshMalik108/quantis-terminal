"""Mocks faithful to REAL response formats captured from the providers (Oct 2026)."""
import json, time, random, datetime, re
from urllib.parse import urlparse, parse_qs, unquote

def px_for(sym):
    base = {'AAPL':343.83,'MSFT':512.4,'NVDA':188.2,'AMZN':231.5,'RELIANCE-IN':1174.5,'TCS-IN':3050.2,'.NSEI':22848.65,'.BSESN':75210.3,
            '.SPX':6620.1,'.DJI':46200.5,'.NDX':24310.2,'US10Y':5.007,'@GC.1':3980.2,'@LCO.1':71.3,'.DXY':101.2,'.VIX':17.4,'BTC.CM=':80063,
            'EUR=':1.152,'INR=':95.22,'SPY':661.2}
    if sym in base: return base[sym]
    return 20 + (sum(map(ord, sym)) * 37) % 900

def fmt_big(v):
    for d, s in ((1e12,'T'),(1e9,'B'),(1e6,'M')):
        if abs(v) >= d: return f'{v/d:.3f}{s}'
    return f'{v:,.2f}'

def series(n, last, seed):
    rnd = random.Random(seed); out=[last]
    for i in range(n-1): out.append(out[-1]/(1+(rnd.random()-0.5)*0.03))
    return out[::-1]

def cnbc_quote(sym):
    last = px_for(sym); seed = sum(map(ord,sym)); chg = round(((seed % 40)-20)/10 * last/100, 2)
    prev = last - chg
    sign = '+' if chg >= 0 else ''
    ccy = 'INR' if sym.endswith('-IN') or sym in ('.NSEI','.BSESN') else ('USD' if not sym.startswith(('.','@','US')) or sym in ('.SPX','.DJI','.NDX') else None)
    q = {'symbol':sym,'name':sym+' Corp','shortName':sym,'last':f'{last:,.2f}','change':f'{sign}{chg:.2f}','change_pct':f'{sign}{chg/prev*100:.2f}%',
         'previous_day_closing':f'{prev:,.2f}','currencyCode':ccy,'curmktstatus':'REG_MKT','volume':'6,527,705','open':f'{prev:,.2f}','high':f'{last*1.01:,.2f}','low':f'{prev*0.99:,.2f}',
         'yrhiprice':f'{last*1.3:,.2f}','yrloprice':f'{last*0.8:,.2f}','last_time':'2026-10-28T16:00:00.000-0400','exchange':'NASDAQ'}
    if not sym.startswith(('.','@','US')) and sym not in ('EUR=','INR=') and not sym.endswith('CM='):
        sh = 14.59e9 if sym=='AAPL' else 2e9 + seed*1e7
        q.update({'pe':'39.56','eps':f'{last/39.56:.2f}','mktcapView':fmt_big(last*sh),'sharesout':fmt_big(sh),'dividendyield':'0.31%','beta':'1.08',
                  'ROETTM':'148.19%','NETPROFTTM':'27.51%','GROSMGNTTM':'48.65%','DEBTEQTYQ':'78.44%','psales':'10.75','revenuettm':fmt_big(last*sh/10.75),'fpe':'37.32','TTMEBITD':'167.959B'})
    if sym == 'US10Y': q.update({'last':'5.007%','change':'-0.038','change_pct':'-0.7532%','previous_day_closing':'5.045%'})
    return q

NOSP = object()
def special_value(col, s, market):
    sym = s.split(':')[1]
    if market in ('bond','bonds'):
        gov = market == 'bonds'
        d = {'name':sym, 'description': ('United States 10 Year Government Bonds' if 'US10Y' in sym else 'Government bond') if gov else ('Apple Inc. 4.65% 15-FEB-2046' if 'US0378' in sym else 'Mock Industries Ltd 7.25% 10-OCT-2034'),
             'close': (4.21 if 'US10Y' in sym else 6.5) if gov else 92.4, 'currency':'USD', 'country':'United States', 'coupon':4.65, 'current_coupon':4.65, 'maturity_date':20460215,
             'yield_to_maturity': None if 'US0378' in sym else 7.9, 'yield_to_worst':None, 'current_yield':None, 'modified_duration':None, 'macaulay_duration':None,
             'bond_snp_rating_lt':'AA+', 'issuer_moodys_rating_lt':'Aaa', 'issuer_fitch_rating_lt':None, 'outstanding_amount':2e9, 'denom_min':2000, 'coupon_frequency':2,
             'days_to_maturity':7036, 'bond_issuer_type':'Corporate', 'accrued_coupon_interest':1.2, 'bond_issuer_stock_symbol':'NASDAQ:AAPL', 'change':0.12, 'exchange':'FWB',
             'bond_type_gen':'Corporate', 'call_next_date':None, 'call_next_price':None, 'maturity_type':'At maturity', 'coupon_type_general':'Fixed'}
        return d.get(col, None)
    if market == 'futures':
        exp = {'CLF2027':20261219,'CLG2027':20270120,'CLH2027':20270219}.get(sym, 20270319)
        px = {'CLF2027':71.2,'CLG2027':71.6,'CLH2027':72.1}.get(sym, 72.5)
        return {'name':sym, 'description':'Crude Oil Futures ('+sym[-5:]+')', 'close':px, 'currency':'USD', 'change':0.8, 'expiration':exp, 'open_interest':250000, 'exchange':'NYMEX', 'volume':180000, 'type':'futures'}.get(col, None)
    if market == 'coin':
        btc = 'BTC' in sym
        return {'name':sym, 'description':'Bitcoin' if btc else 'Solana', 'close':80063 if btc else 85.2, 'currency':'USD', 'change':1.4, 'market_cap_calc':1.59e12 if btc else 5.0e10,
                'circulating_supply':19.9e6 if btc else 5.9e8, 'total_supply':19.9e6 if btc else 6.4e8, 'max_supply':21e6 if btc else None, 'crypto_total_rank':1 if btc else 7, 'volume':3.1e10, 'Perf.Y':42.0,
                'base_currency_logoid':'crypto/XTVCBTC' if btc else 'crypto/XTVCSOL', 'tvl':None}.get(col, None)
    if market == 'forex':
        return {'name':sym, 'description':'EURO / INDIAN RUPEE', 'close':96.1, 'currency':'INR', 'change':0.2, 'exchange':'FX_IDC'}.get(col, None)
    if market == 'cfd':
        return {'name':sym, 'description':'Gold Spot' if 'GOLD' in sym else 'U.S. Dollar Index', 'close':3980.2 if 'GOLD' in sym else 101.2, 'currency':'USD', 'change':0.5, 'exchange':'TVC', 'type':'cfd' if 'GOLD' in sym else 'index', 'typespecs':[]}.get(col, None)
    if market == 'options':
        m = re.match(r'AAPL(\d{6})([CP])([\d.]+)', sym); exp = int('20'+m.group(1)); k = float(m.group(3)); call = m.group(2)=='C'
        S = 343.83; iv = 0.28; intrinsic = max(0, S-k) if call else max(0, k-S)
        return {'name':sym, 'description':sym, 'close':round(intrinsic+6.5,2), 'strike':k, 'expiration':exp, 'option-type':'call' if call else 'put', 'iv':iv, 'delta':0.55 if call else -0.45,
                'gamma':0.008, 'theta':-0.11, 'vega':0.62, 'rho':0.2, 'bid':round(intrinsic+6.3,2), 'ask':round(intrinsic+6.7,2), 'volume':1200, 'open_interest':8800, 'theoPrice':round(intrinsic+6.4,2), 'currency':'USD'}.get(col, None)
    if market == 'global' and col == 'typespecs': return ['common']
    return NOSP
def tv_value(col, s, seed, market='global'):
    rnd = random.Random(seed + sum(map(ord,col)))
    sp = special_value(col, s, market)
    if sp is not NOSP: return sp
    india = s.startswith(('NSE:','BSE:'))
    if col == 'description': return s.split(':')[1] + ' Ltd'
    if col == 'name': return s.split(':')[1]
    if col == 'currency': return 'INR' if india else 'USD'
    if col == 'fundamental_currency_code': return 'USD' if market == 'global' else ('INR' if india else 'USD')   # REAL: global endpoint converts to USD
    if col == 'market_cap_basic': return (1.6e11 if market=='global' else 1.5677e13) if india else 5.0e12 * (0.2 + rnd.random())
    if col in ('price_earnings_ttm',): return 15 + rnd.random()*30
    if col in ('price_book_fq',): return 1 + rnd.random()*10
    if col in ('price_sales_current','enterprise_value_ebitda_ttm'): return 1 + rnd.random()*15
    if col in ('net_margin','gross_margin','operating_margin','return_on_equity','return_on_assets','return_on_invested_capital','total_revenue_yoy_growth_ttm','dividend_payout_ratio_ttm'): return rnd.random()*40
    if col in ('dividends_yield_current',): return rnd.random()*3
    if col in ('debt_to_equity','current_ratio','quick_ratio','beta_1_year','beta_5_year','price_earnings_growth_ttm'): return 0.3 + rnd.random()*1.5
    if col == 'earnings_per_share_diluted_ttm': return (0.58 if market=='global' else 55.22) if india else 8.72
    if col == 'isin': return 'US0378331005'
    if col == 'subtype': return 'etf'
    if col in ('aum',): return 5e11*rnd.random()
    if col in ('total_shares_outstanding_fundamental',): return 13.5e9 if india else 14.59e9
    if col in ('free_cash_flow_ttm',): return 9.8e10
    if col == 'price_earnings_forward_fy': return 25.0
    if col in ('price_52_week_high',): return 400.0
    if col in ('price_52_week_low',): return 240.0
    if col in ('earnings_release_next_date','ex_dividend_date_upcoming','ex_dividend_date_recent'): return int(time.time()) + 86400*int(5+rnd.random()*40)
    if col.startswith('recommendation_'): return int(rnd.random()*20)
    if col.startswith('price_target_'): return 300 + rnd.random()*80
    if col in ('sector',): return ['Electronic Technology','Finance','Energy Minerals','Technology Services','Health Technology'][seed % 5]
    if col == 'industry': return 'Telecommunications Equipment'
    if col == 'country': return 'India' if india else 'United States'
    if col == 'exchange': return s.split(':')[0]
    if col == 'type': return 'stock'
    if col == 'logoid': return s.split(':')[1].lower()
    if col == 'fiscal_period_fy_h': return [2025, 2024, 2023, 2022, 2021]
    if col == 'capital_expenditures_unchanged_fy_h': return [9e9, 9.5e9, 1.1e10, 1.05e10, 1.1e10]
    if col == 'free_cash_flow_fy_h': return [1.36e11, 1.08e11, 9.9e10, 1.1e11, 1.11e11]
    if col == 'total_revenue_fy_h': return [4.16e11, 3.91e11, 3.83e11, 3.94e11, 3.66e11]
    if col == 'gross_profit_fy_h': return [1.95e11, 1.81e11, 1.69e11, 1.71e11, 1.53e11]
    if col == 'ebitda_fy_h': return [1.44e11, 1.35e11, 1.25e11, 1.31e11, 1.2e11]
    if col == 'net_income_fy_h': return [1.12e11, 9.4e10, 9.7e10, 1.0e11, 9.5e10]
    if col == 'total_debt_fy_h': return [9.8e10, 1.07e11, 1.11e11, 1.2e11, 1.25e11]
    if col == 'earnings_per_share_diluted_fy_h': return [7.46, 6.08, 6.13, 6.11, 5.61]
    if col.endswith('_fy_h'): return [1e11*(1+rnd.random()) for _ in range(5)]
    if col.endswith('_fq_h'): return [2.5e10*(1+0.1*rnd.random()) for _ in range(8)]
    neg = {'cash_f_investing_activities_fy':-1.6e10,'cash_f_financing_activities_fy':-1.2e11,'capital_expenditures_fy':-9e9,'total_cash_dividends_paid_fy':-1.5e10,'research_and_dev_fy':-3.4e10,'issuance_of_stock_net_ttm':-8.5e10}
    if col in neg: return neg[col]
    fixed = {'cash_f_operating_activities_fy':1.45e11,'total_revenue_fy':4.16e11,'gross_profit_fy':1.95e11,'oper_income_fy':1.33e11,'ebitda_fy':1.44e11,'net_income_fy':1.12e11,'free_cash_flow_fy':1.36e11,
      'piotroski_f_score_fy':8,'altman_z_score_fy':7.2,'zmijewski_score_fy':-1.7,'sloan_ratio_fy':1.1,'graham_numbers_fy':39.4,'current_ratio_fq':1.02,'quick_ratio_fq':0.94,'debt_to_equity_fq':0.77,'debt_to_asset_fq':0.21,'net_debt_to_ebitda_fq':0.17,
      'asset_turnover_fy':1.25,'invent_turnover_fy':24.2,'receivables_turnover_fy':6.1,'fixed_assets_turnover_fy':7.7,'interst_cover_fy':None,'ebitda_interst_cover_fy':None}
    if col in fixed: return fixed[col]
    if col.endswith('_fy') and any(k in col for k in ('margin','growth','return_on','payout','rate','ratio')): return 40*rnd.random()-5
    if col == 'close': return 1174.0 if india else 343.83
    if col == 'change': return (rnd.random()-0.5)*4
    if col == 'change_abs': return round(((1174.0 if india else 343.83))*(rnd.random()-0.5)*0.04, 2)
    if col in ('open','high','low'): return 1174.0 if india else 343.83
    if col == 'volume': return 1234567
    if col == 'RSI': return 30 + rnd.random()*40
    if col == 'Perf.Y': return (rnd.random()-0.3)*60
    if col == 'expense_ratio': return 0.0945 if s.startswith('AMEX:') else None
    if col == 'brand': return 'SPDR' if s.startswith('AMEX:') else None
    if col in ('is_primary',): return True
    return 1e10 * rnd.random()

def _opt_syms(body):
    exp = None
    for f in body.get('filter', []):
        if f.get('left') == 'expiration' and f.get('operation') == 'equal': exp = f['right']
    exps = [20261218, 20270115] if exp is None else [exp]
    out = []
    for e in exps:
        for k in (300, 320, 340, 360, 380):
            for t in ('C', 'P'): out.append(f'OPRA:AAPL{str(e)[2:]}{t}{k}.0')
    return out[:max(1, body.get('range',[0,400])[1])]
SPECIAL = {
  'bond': lambda b: ['FWB:US0378AB12', 'FWB:XS2345678901'],
  'bonds': lambda b: [x for x in ['TVC:US10Y','TVC:IN10Y','TVC:DE10Y'] if not b.get('symbols') or x in b['symbols']['tickers']] or ['TVC:US10Y'],
  'futures': lambda b: ['NYMEX:CLF2027', 'NYMEX:CLG2027', 'NYMEX:CLH2027'],
  'coin': lambda b: ['CRYPTO:BTCUSD', 'CRYPTO:SOLUSD'],
  'forex': lambda b: ['FX_IDC:EURINR'],
  'cfd': lambda b: ['TVC:GOLD', 'TVC:DXY'],
  'options': _opt_syms,
}

def tv_scan(path, body):
    body = json.loads(body or '{}')
    cols = body.get('columns', [])
    mk = path.strip('/').split('/')[0]
    if 'symbols' in body and body['symbols'].get('tickers'):
        syms = body['symbols']['tickers']
        localmap = {'india':('NSE','BSE'),'america':('NASDAQ','NYSE','AMEX','CBOE','OTC'),'uk':('LSE',),'germany':('XETR',),'japan':('TSE',),'hongkong':('HKEX',),'korea':('KRX',),'australia':('ASX',),'switzerland':('SIX',),'france':('EURONEXT',)}
        if mk not in ('global','bonds','bond','futures','coin','forex','cfd') : syms = [x for x in syms if x.split(':')[0] in localmap.get(mk, ())]
        total = len(syms)
    elif mk in SPECIAL:
        syms = SPECIAL[mk](body); total = len(syms)
        if mk == 'options' and body.get('range',[0,0])[1] <= 1: total = 120
    else:
        rng = body.get('range', [0, 50]); n = max(0, min(rng[1]-rng[0], 60))
        pre = 'NSE' if mk == 'india' else 'NASDAQ'
        syms = [f'{pre}:S{i:03d}' for i in range(rng[0], rng[0]+n)]
        total = 1164 if mk == 'india' else 5200
        # breadth-style filters: totalCount varies with the filter
        for f in body.get('filter', []):
            if f.get('left') == 'change': total = 2100 if f.get('operation') in ('greater','egreater') else 1900
    return {'totalCount': total, 'data': [{'s': s, 'd': [tv_value(c, s, sum(map(ord, s)), mk) for c in cols]} for s in syms]}

def respond(u, method='GET', body=None):
    p = urlparse(u); host = p.netloc; path = p.path; q = parse_qs(p.query)
    if host == 'quote.cnbc.com':
        syms = unquote(q['symbols'][0]).split('|')
        res = [({'symbol':s,'code':3} if s in ('005930-KR','.BSESN') else cnbc_quote(s)) for s in syms]  # REAL: CNBC can't price these
        return ('application/json', json.dumps({'FormattedQuoteResult': {'FormattedQuote': res if len(res) > 1 else res[0]}}))
    if host == 'ts-api.cnbc.com':
        mi = re.match(r'/harmony/app/bars/([^/]+)/(1M|5M|30M|1H)/(\d{12})\d+/', path)
        if mi:
            sym = unquote(mi.group(1)); step = {'1M':60,'5M':300,'30M':1800,'1H':3600}[mi.group(2)]; now = int(time.time()); n = 400
            cl = series(n, px_for(sym), sum(map(ord, sym))+step)
            bars = [{'open': f'{c*0.999:.4f}', 'high': f'{c*1.002:.4f}', 'low': f'{c*0.998:.4f}', 'close': f'{c:.4f}', 'volume': 12000, 'tradeTimeinMills': str((now-(n-i)*step)*1000)} for i, c in enumerate(cl)]
            return ('application/json', json.dumps({'barData': {'priceBars': bars}}))
        m = re.match(r'/harmony/app/bars/([^/]+)/1D/(\d{8})\d+/(\d{8})\d+/', path)
        if not m: return None
        sym = unquote(m.group(1)); d0 = datetime.datetime.strptime(m.group(2), '%Y%m%d'); d1 = datetime.datetime.strptime(m.group(3), '%Y%m%d')
        days = [d0 + datetime.timedelta(days=i) for i in range((d1-d0).days) if (d0 + datetime.timedelta(days=i)).weekday() < 5 and d0 + datetime.timedelta(days=i) <= datetime.datetime.now()]
        cl = series(len(days), px_for(sym), sum(map(ord, sym)))
        bars = [{'open': f'{c*0.997:.4f}', 'high': f'{c*1.01:.4f}', 'low': f'{c*0.99:.4f}', 'close': f'{c:.4f}', 'volume': 4230000, 'tradeTime': d.strftime('%Y%m%d') + '000000', 'tradeTimeinMills': str(int(d.timestamp()*1000))} for d, c in zip(days, cl)]
        return ('application/json', json.dumps({'barData': {'priceBars': bars, 'companyName': sym + ' Corp'}}))
    if host == 'symlookup.cnbc.com':
        pre = q['prefix'][0].upper()
        return ('application/json', json.dumps([{'TotalMatchAvailable': '1'}, {'issuerId': '1', 'issueType': 'STOCK', 'countryCode': 'GB', 'exchangeName': 'London Stock Exchange', 'issueId': '2', 'symbolName': pre[:4] + '-GB', 'companyName': pre.title() + ' plc'}]))
    if host == 'scanner.tradingview.com':
        return ('application/json', json.dumps(tv_scan(path, body)))
    if host == 's3-symbol-logo.tradingview.com':
        return ('image/svg+xml', '<svg width="56" height="56" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="56" fill="#888"/></svg>')
    if host == 'api.queryly.com':
        now = datetime.datetime.utcnow()
        res = [{'cn:title': f'{q["query"][0]} headline {i}', 'description': 'desc', 'summary': 'Summary text', 'url': f'https://www.cnbc.com/2026/10/28/story-{i}.html',
                'datePublished': (now - datetime.timedelta(hours=i*5)).strftime('%Y-%m-%dT%H:%M:%S+0000'), '_pubDate': '10/28/2026 7:40:02 PM', 'cn:branding': 'cnbc', 'section': 'Tech'} for i in range(8)]
        return ('application/json', json.dumps({'metadata': {'totalresults': 8}, 'results': res}))
    if host == 'api.bls.gov':
        sid = path.split('/')[-1]; base = 320.0 if 'CUUR' in sid else 4.3
        data = []
        for k in range(30):
            y = 2026 - (k + 3)//12; mth = 12 - ((k + 3) % 12)
            data.append({'year': str(y), 'period': f'M{mth:02d}', 'periodName': datetime.date(2000, mth, 1).strftime('%B'), 'value': f'{base*(1-0.0025*k):.3f}' if 'CUUR' in sid else f'{base+0.01*k:.1f}'})
        return ('application/json', json.dumps({'status': 'REQUEST_SUCCEEDED', 'Results': {'series': [{'seriesID': sid, 'data': data}]}}))
    if host == 'api.db.nomics.world':
        per = [f'{y}-Q{qq}' for y in range(2023, 2027) for qq in range(1, 5)][:14] if 'NIPA' in path else [(datetime.date.today() - datetime.timedelta(days=i)).isoformat() for i in range(30, 0, -1)]
        val = [2.1 + 0.1*i for i in range(len(per))] if 'NIPA' in path else [4.33]*len(per)
        return ('application/json', json.dumps({'series': {'docs': [{'period': per, 'value': val, 'series_name': 'mock'}]}}))
    if host == 'api.frankfurter.dev':
        if path.endswith('/latest'):
            base = q.get('base', ['USD'])[0]; to = q.get('symbols', ['USD'])[0]
            usd = {'USD': 1, 'INR': 1/95.22, 'EUR': 1.152, 'GBP': 1.31, 'JPY': 1/150}
            return ('application/json', json.dumps({'amount': 1.0, 'base': base, 'date': '2026-10-28', 'rates': {to: usd.get(base, 1)/usd.get(to, 1)}}))
        m = re.match(r'/v1/(\d{4}-\d\d-\d\d)\.\.(\d{4}-\d\d-\d\d)', path)
        if m:
            to = q.get('symbols', ['USD'])[0]; d0 = datetime.date.fromisoformat(m.group(1)); d1 = datetime.date.fromisoformat(m.group(2))
            ds = [d0 + datetime.timedelta(days=i) for i in range((d1-d0).days) if (d0 + datetime.timedelta(days=i)).weekday() < 5]
            cl = series(len(ds), 1.152, 9)
            return ('application/json', json.dumps({'base': q.get('base', ['EUR'])[0], 'rates': {d.isoformat(): {to: round(c, 4)} for d, c in zip(ds, cl)}}))
    if host == 'api.coingecko.com' and 'simple/price' in path:
        if 'market_chart' in path:
            n = 365; c = series(n, 80063, 7); now = int(time.time()*1000)
            return ('application/json', json.dumps({'prices': [[now - 86400000*(n-i), c[i]] for i in range(n)]}))
        if 'simple/price' in path:
            return ('application/json', json.dumps({'bitcoin': {'usd': 80063, 'usd_24h_change': 1.2}, 'ethereum': {'usd': 3400, 'usd_24h_change': -0.5}}))
        if '/coins/' in path:
            return ('application/json', json.dumps({'market_cap_rank': 1, 'market_data': {'market_cap': {'usd': 1.6e12}, 'ath': {'usd': 126000}, 'ath_date': {'usd': '2025-10-06T00:00:00Z'}, 'circulating_supply': 19.9e6, 'total_supply': 21e6, 'max_supply': 21e6}}))
    if host == 'api.alternative.me':
        return ('application/json', json.dumps({'data': [{'value': '51', 'value_classification': 'Neutral', 'timestamp': str(int(time.time()))}]}))
    if host == 'en.wikipedia.org' and 'api.php' in path:
        return ('application/json', json.dumps({'query': {'search': [{'title': 'Mock Inc.'}]}}))
    if host == 'api.coingecko.com':
        if '/search' in path: return ('application/json', json.dumps({'coins':[{'id':'bitcoin','symbol':'btc','name':'Bitcoin'},{'id':'solana','symbol':'sol','name':'Solana'}]}))
        if '/market_chart' in path:
            n=366; now=int(time.time()*1000); c=series(n, 80063 if 'bitcoin' in path else 85.2, 9)
            return ('application/json', json.dumps({'prices':[[now-(n-i)*864e5, v] for i,v in enumerate(c)], 'market_caps':[[now-(n-i)*864e5, v*19.9e6] for i,v in enumerate(c)], 'total_volumes':[[now-(n-i)*864e5, 3e10] for i in range(n)]}))
        if re.match(r'/api/v3/coins/[a-z-]+$', path):
            btc = 'bitcoin' in path
            return ('application/json', json.dumps({'id':'bitcoin' if btc else 'solana','symbol':'btc' if btc else 'sol','name':'Bitcoin' if btc else 'Solana','market_cap_rank':1 if btc else 7,
              'categories':['Layer 1 (L1)','Proof of Work (PoW)'],'hashing_algorithm':'SHA-256' if btc else None,'genesis_date':'2009-01-03' if btc else None,
              'description':{'en':'Bitcoin is the first decentralized cryptocurrency.'},'links':{'homepage':['https://bitcoin.org']},'image':{'large':'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png'},
              'sentiment_votes_up_percentage':78,'developer_data':{'stars':73000,'forks':36000,'commit_count_4_weeks':120,'pull_request_contributors':900,'closed_issues':7000,'total_issues':7600},
              'community_data':{'twitter_followers':6900000,'reddit_subscribers':5000000},
              'market_data':{'current_price':{'usd':80063 if btc else 85.2},'market_cap':{'usd':1.59e12},'fully_diluted_valuation':{'usd':1.68e12},'total_volume':{'usd':3.1e10},'circulating_supply':19.9e6,'total_supply':19.9e6,'max_supply':21e6 if btc else None,
                'ath':{'usd':126000},'ath_date':{'usd':'2025-10-06T00:00:00Z'},'ath_change_percentage':{'usd':-36.5},'atl':{'usd':67.8},'atl_date':{'usd':'2013-07-06T00:00:00Z'},
                'price_change_percentage_24h':1.4,'price_change_percentage_7d':-2.1,'price_change_percentage_30d':5.2,'price_change_percentage_1y':42.0,'total_value_locked':None}}))
        if 'simple/price' in path or '/coins/' in path: pass
    if host == 'api.llama.fi':
        if path == '/v2/chains': return ('application/json', json.dumps([{'name':'Bitcoin','tvl':6.1e9,'tokenSymbol':'BTC'},{'name':'Solana','tvl':9.8e9,'tokenSymbol':'SOL'}]))
        return ('application/json', json.dumps({'name':'Aave','tvl':[{'date':1,'totalLiquidityUSD':2.5e10}],'category':'Lending','chains':['Ethereum']}))
    if host == 'api.exchange.coinbase.com': return ('application/json', json.dumps({'last':'80050.12','open':'79000','high':'81000','low':'78500','volume':'12000'}))
    if host == 'mempool.space':
        if 'fees' in path: return ('application/json', json.dumps({'fastestFee':3,'halfHourFee':2,'hourFee':1,'economyFee':1,'minimumFee':1}))
        return ('application/json', json.dumps({'currentHashrate':9.8e20,'currentDifficulty':1.4e14}))
    if host == 'open.er-api.com': return ('application/json', json.dumps({'result':'success','time_last_update_utc':'Tue, 10 Nov 2026 00:02:31 +0000','rates':{'INR':96.05,'USD':1.16,'EUR':1}}))
    if host == 'www.wikidata.org':
        if q.get('action',[''])[0] == 'wbsearchentities': return ('application/json', json.dumps({'search':[{'id':'Q312','description':'American multinational technology company'}]}))
        ids = q.get('ids',[''])[0].split('|')
        if 'Q312' in ids: return ('application/json', json.dumps({'entities':{'Q312':{'labels':{'en':{'value':'Apple Inc.'}},'descriptions':{'en':{'value':'American multinational technology company'}},'sitelinks':{'enwiki':{'title':'Apple Inc.'}},
            'claims':{'P571':[{'rank':'normal','mainsnak':{'datavalue':{'value':{'time':'+1976-04-01T00:00:00Z'}}}}],'P159':[{'rank':'normal','mainsnak':{'datavalue':{'value':{'id':'Q49219'}}}}],'P169':[{'rank':'normal','mainsnak':{'datavalue':{'value':{'id':'Q265852'}}}}],
            'P856':[{'rank':'normal','mainsnak':{'datavalue':{'value':'https://www.apple.com'}}}],'P1128':[{'rank':'normal','mainsnak':{'datavalue':{'value':{'amount':'+166000'}}}}]}}}}))
        return ('application/json', json.dumps({'entities':{i:{'id':i,'labels':{'en':{'value':{'Q49219':'Cupertino','Q265852':'Tim Cook'}.get(i,'Label '+i)}}} for i in ids}}))
    if host == 'financialmodelingprep.com':
        per = q.get('period',['annual'])[0]; n = 6 if per=='annual' else 8
        dates = [f'{2025-i}-09-27' for i in range(n)] if per=='annual' else [(datetime.date(2026,9,27)-datetime.timedelta(days=91*i)).isoformat() for i in range(n)]
        k = 1 if per=='annual' else 0.25
        if 'income' in path: rows=[{'date':d,'fiscalYear':d[:4],'period':'FY' if per=='annual' else 'Q'+str((i%4)+1),'reportedCurrency':'USD','revenue':4.16e11*k,'costOfRevenue':2.21e11*k,'grossProfit':1.95e11*k,'researchAndDevelopmentExpenses':3.4e10*k,'sellingGeneralAndAdministrativeExpenses':2.7e10*k,'operatingIncome':1.33e11*k,'ebitda':1.44e11*k,'depreciationAndAmortization':1.1e10*k,'interestExpense':0.0 if i>2 else 3.0e9*k,'incomeBeforeTax':1.34e11*k,'incomeTaxExpense':2.2e10*k,'netIncome':1.12e11*k,'epsDiluted':7.46*k} for i,d in enumerate(dates)]
        elif 'balance' in path: rows=[{'date':d,'cashAndCashEquivalents':3.3e10,'netReceivables':6.6e10,'inventory':7.3e9,'totalCurrentAssets':1.74e11,'propertyPlantEquipmentNet':4.9e10,'goodwill':0,'totalAssets':4.05e11,'accountPayables':6.9e10,'shortTermDebt':1.4e10,'totalCurrentLiabilities':1.7e11,'longTermDebt':7.2e10,'totalLiabilities':2.92e11,'totalStockholdersEquity':1.12e11,'retainedEarnings':-1.4e10} for d in dates]
        else: rows=[{'date':d,'operatingCashFlow':1.45e11*k,'capitalExpenditure':-9e9*k,'netCashProvidedByInvestingActivities':-1.7e10*k,'netCashProvidedByFinancingActivities':-1.27e11*k,'commonDividendsPaid':-1.57e10*k,'commonStockRepurchased':-8.9e10*k,'netDebtIssuance':-5e9*k,'stockBasedCompensation':1.2e10*k,'changeInWorkingCapital':-2e9*k,'depreciationAndAmortization':1.1e10*k} for d in dates]
        return ('application/json', json.dumps(rows))
    if host == 'api.mfapi.in' and re.match(r'/mf/\d+$', path):
        n = 1500; c = series(n, 92.4, 5); d = datetime.date.today()
        return ('application/json', json.dumps({'meta':{'fund_house':'PPFAS Mutual Fund','scheme_type':'Open Ended Schemes','scheme_category':'Equity Scheme - Flexi Cap Fund','scheme_code':122639,'scheme_name':'Parag Parikh Flexi Cap Fund - Direct Plan - Growth','isin_growth':'INF879O01027'},
            'data':[{'date':(d-datetime.timedelta(days=i)).strftime('%d-%m-%Y'),'nav':f'{c[n-1-i]:.4f}'} for i in range(n)],'status':'SUCCESS'}))
    if host == 'my-api.example.com': return ('application/json', json.dumps({'data':[{'pe':31.5,'dy':0.0045,'note':'<img src=x onerror=alert(1)>'}]}))
    if host == 'text.pollinations.ai':
        return ('application/json', json.dumps({'choices': [{'message': {'content': '## Summary\n- **Cash flow** is strong.\n- Margins rose.\n\nPlain paragraph.'}}], 'model': 'gpt-oss-20b'}))
    if host == 'en.wikipedia.org':
        return ('application/json', json.dumps({'type': 'standard', 'title': 'Mock', 'extract': 'Mock company summary.', 'content_urls': {'desktop': {'page': 'https://en.wikipedia.org/wiki/Mock'}}}))
    if host == 'date.nager.at':
        return ('application/json', json.dumps([{'date': '2026-12-25', 'localName': 'Christmas', 'name': 'Christmas'}]))
    if host == 'api.worldbank.org':
        return ('application/json', json.dumps([{'page': 1}, [{'value': 2.3, 'date': '2025'}]]))
    if host == 'publicreporting.cftc.gov':
        return ('application/json', json.dumps([{'report_date_as_yyyy_mm_dd': '2026-10-20T00:00:00.000', 'noncomm_positions_long_all': '200000', 'noncomm_positions_short_all': '150000', 'comm_positions_long_all': '300000', 'comm_positions_short_all': '350000', 'open_interest_all': '2000000'}]))
    if host == 'api.kuvera.in':
        if 'list.json' in path:
            return ('application/json', json.dumps({'Equity': {'Flexi Cap Fund': {'PPFAS_MF': [{'c': 'PPFCF-GR', 'n': 'Parag Parikh Flexi Cap Growth Direct Plan', 're': 'Y'}]}}}))
        return None  # REAL: v5 detail endpoint is not CORS-enabled
    if host == 'api.mfapi.in':
        if '/search' in path:
            return ('application/json', json.dumps([{'schemeCode': 122639, 'schemeName': 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'}]))
        n = 900; c = series(n, 92.4, 5); d = datetime.date.today()
        data = [{'date': (d - datetime.timedelta(days=i)).strftime('%d-%m-%Y'), 'nav': f'{c[n-1-i]:.4f}'} for i in range(n)]
        if path.endswith('/latest'): data = data[:1]
        return ('application/json', json.dumps({'meta': {'fund_house': 'PPFAS Mutual Fund', 'scheme_type': 'Open Ended Schemes', 'scheme_category': 'Equity Scheme - Flexi Cap Fund', 'scheme_code': 122639, 'scheme_name': 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'}, 'data': data, 'status': 'SUCCESS'}))
    if host == 'api.fiscaldata.treasury.gov':
        return ('application/json', json.dumps({'data': [{'record_date': '2026-09-30', 'security_desc': 'Treasury Notes', 'avg_interest_rate_amt': '3.4'}]}))
    return None  # everything else (Yahoo, SEC, FRED, OpenFIGI, CBOE, public CORS proxies) is NOT reachable from a browser
