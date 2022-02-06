const scriptProperties = PropertiesService.getScriptProperties()
const CACHE = CacheService.getScriptCache()

const EXPIRATION_DEFAULT = 10 // 10 seconds
const EXPIRATION_MAX = 21600 // 6 hours

const API_TOKEN = scriptProperties.getProperty('API_TOKEN')

const tAPI = new TinkoffApp({
  token: API_TOKEN, // укажите здесь свой токен
  // logging: true // Опционально - показывать в логах запросы и ответы
})

/* ####################################################################################################### */

function _apiRequest(cache, apiMethod, methodArgs = []) {
  if (cache.length)
    var [cacheKey, cacheExpireTime] = cache
    const cached = CACHE.get(cacheKey)
    if (cached != null) {
      Logger.log(`cacheKey ${cacheKey} found`)
      return JSON.parse(cached)
    }

  Logger.log(`cacheKey ${cacheKey} NOT found`)

  const [v1='', v2='', v3=''] = methodArgs
  const result = tAPI[apiMethod](v1, v2, v3)

  if (cache.length)
    CACHE.put(cacheKey, JSON.stringify(result), cacheExpireTime)
  return result
}

/* ####################################################################################################### */

function _getPositions(accountId) {
  return _apiRequest([accountId + '_positions', EXPIRATION_DEFAULT], 'OperationsGetPositions', [accountId])
}

function _getAllBonds(instrumentStatus) {
  return _apiRequest([], 'InstrumentsBonds', [instrumentStatus])
}

function _getAllEtfs(instrumentStatus) {
  return _apiRequest([], 'InstrumentsEtfs', [instrumentStatus])
}

function _getAllShares(instrumentStatus) {
  return _apiRequest([], 'InstrumentsShares', [instrumentStatus])
}

function _getAllInstruments() {
  const bonds = _getAllBonds(1).instruments
  const etfs = _getAllEtfs(1).instruments
  const shares = _getAllShares(1).instruments
  const all = bonds.concat(etfs,shares)
  return all
}

function _getFigiByTicker(ticker) {
  const cached = CACHE.get(ticker + '_figi')
  if (cached != null) {
    Logger.log(`cacheKey ${ticker + '_figi'} found`)
    return cached
  }

  Logger.log(`cacheKey ${ticker + '_figi'} NOT found`)

  const {figi} = _getAllInstruments().find(x => x.ticker === ticker)

  CACHE.put(ticker + '_figi', figi)
  return figi
}

function _getInstrumentByFigi(figi) {
  const idType = 1
  const classCode = ''
  return _apiRequest([figi + '_instrument', EXPIRATION_MAX], 'InstrumentsGetInstrumentBy', [idType, classCode, figi]).instrument
}

/* ####################################################################################################### */

function getAccounts() {
  return JSON.stringify(_apiRequest(['accounts', EXPIRATION_MAX], 'UsersGetAccounts').accounts)
}

function getAccountBalanceByCurrency(accountId, currency, dummy) {
  const positions = _getPositions(accountId).money
  const units = positions.find(x => x.currency === currency.toLowerCase()).units || 0
  const nano_value = positions.find(x => x.currency === currency.toLowerCase()).nano || 0
  const nano = new String(nano_value).substring(0,2) || 0
  return Number(units + '.' + nano)
}

function getAccountBalanceByTicker(accountId, ticker, dummy) {
  const figi = _getFigiByTicker(ticker)
  const positions = _getPositions(accountId).securities
  return balance = positions.find(x => x.figi === figi).balance
}

function getCurrencyByTicker(ticker, dummy) {
  const figi = _getFigiByTicker(ticker)
  return _getInstrumentByFigi(figi).currency.toUpperCase()
}

function getNameByTicker(ticker, dummy) {
  const figi = _getFigiByTicker(ticker)
  return _getInstrumentByFigi(figi).name
}

function getPriceByTicker(ticker, dummy) {
  // dummy attribute uses for auto-refreshing the value each time the sheet is updating.
  // see https://stackoverflow.com/a/27656313
  const figi = _getFigiByTicker(ticker)
  const {lastPrices} = _apiRequest([ticker + '_price', EXPIRATION_DEFAULT], 'MarketDataGetLastPrices', [figi])
  const price = lastPrices.find(x => x.figi = figi).price
  const units = price.units || 0
  const nano_value = price.nano || 0
  const nano = new String(nano_value).substring(0,2)
  Logger.log(Number(units + '.' + nano))
  return Number(units + '.' + nano)
}

/* ####################################################################################################### */

function onEdit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
  sheet.getRange('Z1').setValue(Math.random())
}
