// SOURCE:
// https://github.com/kdeyko/gas-tinkoff-trades

const scriptProperties = PropertiesService.getScriptProperties()
const CACHE = CacheService.getScriptCache()
// How long the portfolio data will stay cached. Change this var to some bigger value if you are hitting API limits
const EXPIRATION_IN_SECONDS = 10

const OPENAPI_TOKEN = scriptProperties.getProperty('OPENAPI_TOKEN')
const TRADING_START_AT = new Date('Apr 01, 2020 10:00:00')
const MILLIS_PER_DAY = 1000 * 60 * 60 * 24

function isoToDate(dateStr){
  // How to format date string so that google scripts recognizes it?
  // https://stackoverflow.com/a/17253060
  const str = dateStr.replace(/-/,'/').replace(/-/,'/').replace(/T/,' ').replace(/\+/,' \+').replace(/Z/,' +00')
  return new Date(str)
}

class TinkoffClient {
  // Doc: https://tinkoffcreditsystems.github.io/invest-openapi/swagger-ui/
  // How to create a token: https://tinkoffcreditsystems.github.io/invest-openapi/auth/
  constructor(token) {
    this.token = token
    this.baseUrl = 'https://api-invest.tinkoff.ru/openapi/'
  }
  
  _makeApiCall(methodUrl) {
    const url = this.baseUrl + methodUrl
    Logger.log(`[API Call] ${url}`)
    const params = {'escaping': false, 'headers': {'accept': 'application/json', "Authorization": `Bearer ${this.token}`}}
    const response = UrlFetchApp.fetch(url, params)
    if (response.getResponseCode() == 200)
      return JSON.parse(response.getContentText())
  }

  getbrokerAccountIds() {
    const url = 'user/accounts'
    const data = this._makeApiCall(url)
    return data.payload.accounts
  }

  getPortfolio(brokerAccountId) {
    const url = `portfolio?brokerAccountId=${brokerAccountId}`
    const data = this._makeApiCall(url)
    return data.payload.positions
  }

  getPortfolioCurrencies(brokerAccountId) {
    const url = `portfolio/currencies?brokerAccountId=${brokerAccountId}`
    const data = this._makeApiCall(url)
    return data.payload.currencies
  }

  getInstrumentByTicker(ticker) {
    const url = `market/search/by-ticker?ticker=${ticker}`
    const data = this._makeApiCall(url)
    return data.payload.instruments[0]
  }
  
  getOrderbookByFigi(figi, depth) {
    const url = `market/orderbook?depth=${depth}&figi=${figi}`
    const data = this._makeApiCall(url)
    return data.payload
  }
  
  getOperations(from, to, figi) {
    // Arguments `from` && `to` should be in ISO 8601 format
    const url = `operations?from=${from}&to=${to}&figi=${figi}`
    const data = this._makeApiCall(url)
    return data.payload.operations
  }
}

const tinkoffClient = new TinkoffClient(OPENAPI_TOKEN)

function _getFigiByTicker(ticker) {
  const cached = CACHE.get(ticker + '_figi')
  if (cached != null)
    return cached
  const {figi} = tinkoffClient.getInstrumentByTicker(ticker)
  CACHE.put(ticker + '_figi', figi)
  return figi
}

function _getPortfolioByAccountId(brokerAccountId) {
  const cached = CACHE.get(brokerAccountId + '_portfolio')
  if (cached != null)
    return cached
  const portfolio = JSON.stringify(tinkoffClient.getPortfolio(brokerAccountId))
  CACHE.put(brokerAccountId + '_portfolio', portfolio, EXPIRATION_IN_SECONDS)
  return portfolio
}

function _getCurrenciesByAccountId(brokerAccountId) {
  const cached = CACHE.get(brokerAccountId + '_currencies')
  if (cached != null)
    return cached
  const currencies = JSON.stringify(tinkoffClient.getPortfolioCurrencies(brokerAccountId))
  CACHE.put(brokerAccountId + '_currencies', currencies, EXPIRATION_IN_SECONDS)
  return currencies
}

function getAccountBalanceByCurrency(accountId, currency, dummy) {
  const currencies = JSON.parse(_getCurrenciesByAccountId(accountId))
  const balance = currencies.find(x => x.currency === currency).balance
  return balance
}

function getAccountBalanceByTicker(accountId, ticker, dummy) {
  const portfolio = JSON.parse(_getPortfolioByAccountId(accountId))
  const balance = portfolio.find(x => x.ticker === ticker).balance
  return balance
}

function getAccounts() {
  const cached = CACHE.get('brokerAccounts')
  if (cached != null)
    return cached
  const brokerAccounts = JSON.stringify(tinkoffClient.getbrokerAccountIds())
  CACHE.put('brokerAccounts', brokerAccounts)
  return brokerAccounts
}

function getNameByTicker(ticker, dummy) {
  const cached = CACHE.get(ticker + '_name')
  if (cached != null)
    return cached
  const {name} = tinkoffClient.getInstrumentByTicker(ticker)
  CACHE.put(ticker + '_name', name)
  return name
}

function getCurrencyByTicker(ticker, dummy) {
  const cached = CACHE.get(ticker + '_currency')
  if (cached != null)
    return cached
  const {currency} = tinkoffClient.getInstrumentByTicker(ticker)
  CACHE.put(ticker + '_currency', currency)
  return currency
}

function getPriceByTicker(ticker, dummy) {
  // dummy attribute uses for auto-refreshing the value each time the sheet is updating.
  // see https://stackoverflow.com/a/27656313
  const figi = _getFigiByTicker(ticker)
  const {lastPrice} = tinkoffClient.getOrderbookByFigi(figi, 1)
  return lastPrice
}

function getMaxBidByTicker(ticker, dummy) {
  // dummy attribute uses for auto-refreshing the value each time the sheet is updating.
  // see https://stackoverflow.com/a/27656313
  const figi = _getFigiByTicker(ticker)
  const {bids} = tinkoffClient.getOrderbookByFigi(figi, 20)
  return [
    ["Max bid", "Quantity"],
    [bids[0].price, bids[0].quantity]
  ]
}

function getMinAskByTicker(ticker, dummy) {
  // dummy attribute uses for auto-refreshing the value each time the sheet is updating.
  // see https://stackoverflow.com/a/27656313
  const figi = _getFigiByTicker(ticker)
  const {asks} = tinkoffClient.getOrderbookByFigi(figi, 20)
  return [
    ["Min ask", "Quantity"],
    [asks[0].price, asks[0].quantity]
  ]
}

function _calculateTrades(trades) {
  let totalSum = 0
  let totalQuantity = 0
  for (let j in trades) {
    const {quantity, price} = trades[j]
    totalQuantity += quantity
    totalSum += quantity * price
  }
  const weigthedPrice = totalSum / totalQuantity
  return [totalQuantity, totalSum, weigthedPrice]
}

function getTrades(ticker, from, to) {
  const figi = _getFigiByTicker(ticker)
  if (!from) {
    from = TRADING_START_AT.toISOString()
  }
  if (!to) {
    const now = new Date()
    to = new Date(now + MILLIS_PER_DAY)
    to = to.toISOString()
  }
  const operations = tinkoffClient.getOperations(from, to, figi)
  
  const values = [
    ["ID", "Date", "Operation", "Ticker", "Quantity", "Price", "Currency", "SUM", "Commission"], 
  ]
  for (let i=operations.length-1; i>=0; i--) {
    const {operationType, status, trades, id, date, currency, commission} = operations[i]
    if (operationType == "BrokerCommission" || status == "Decline" || operationType == "Dividend")
      continue
    let [totalQuantity, totalSum, weigthedPrice] = _calculateTrades(trades) // calculate weighted values
    if (operationType == "Buy") {  // inverse values in a way, that it will be easier to work with
      totalQuantity = -totalQuantity
      totalSum = -totalSum
    }
    values.push([
      id, isoToDate(date), operationType, ticker, totalQuantity, weigthedPrice, currency, totalSum, commission.value
    ])
  }
  return values
}

function onEdit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
  sheet.getRange('Z1').setValue(Math.random())
}
