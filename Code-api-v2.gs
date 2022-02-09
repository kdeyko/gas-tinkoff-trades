const scriptProperties = PropertiesService.getScriptProperties()
const CACHE = CacheService.getScriptCache()

const EXPIRATION_DEFAULT = 15 // 15 seconds
const EXPIRATION_MAX = 21600 // 6 hours

// https://github.com/Tinkoff/investAPI/issues/7#issuecomment-1008327025
// https://tinkoff.github.io/investAPI/faq_custom_types/#java_1
const NANO_FACTOR = 1000000000

const API_TOKEN = scriptProperties.getProperty('API_TOKEN')

const tAPI = new TinkoffApp({
  token: API_TOKEN, // укажите здесь свой токен
  logging: true // Опционально - показывать в логах запросы и ответы
})

/* ####################################################################################################### */

function _apiRequest(cache, apiMethod, methodArgs = []) {
  let statusCacheKey
  if (cache.length) {
    var [cacheKey, cacheExpireTime] = cache
    statusCacheKey = 'status_' + cacheKey

    if (CACHE.get(statusCacheKey) === 'ready') {
      const cached = CACHE.get(cacheKey)
      if (cached != null) {
        Logger.log(`cacheKey ${cacheKey} found: ${cached}`)
        return JSON.parse(cached)
      }
    }
    Logger.log(`cacheKey ${cacheKey} NOT found`)

    while (CACHE.get(statusCacheKey) === 'in-progress') {
      Utilities.sleep(500);
    }
    Logger.log(`Setting ${statusCacheKey} to IN-PROGRESS`)
    CACHE.put(statusCacheKey, 'in-progress')
  }

  const [v1='', v2='', v3=''] = methodArgs
  const result = tAPI[apiMethod](v1, v2, v3)

  if (cache.length) {
    CACHE.put(cacheKey, JSON.stringify(result), cacheExpireTime)
    Logger.log(`Setting ${statusCacheKey} to READY`)
    CACHE.put(statusCacheKey, 'ready', cacheExpireTime)
  }
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

function _getBondByFigi(figi) {
  const idType = 1
  const classCode = ''
  return _apiRequest([figi + '_bond', EXPIRATION_MAX], 'InstrumentsBondBy', [idType, classCode, figi]).instrument
}

function _getAllInstruments() {
  const bonds = _getAllBonds(1).instruments
  const etfs = _getAllEtfs(1).instruments
  const shares = _getAllShares(1).instruments
  const all = bonds.concat(etfs,shares)
  return all
}

function _getFigiByTicker(ticker) {
  const cacheKey = ticker + '_figi'
  const cached = CACHE.get(cacheKey)
  if (cached != null) {
    Logger.log(`cacheKey ${cacheKey} found: ${cached}`)
    return cached
  }
  Logger.log(`cacheKey ${cacheKey} NOT found`)

  const {figi} = _getAllInstruments().find(x => x.ticker === ticker)

  CACHE.put(cacheKey, figi)
  Logger.log(ticker + ' figi: ' + figi)
  return figi
}

function _getInstrumentByFigi(figi) {
  const idType = 1
  const classCode = ''
  return _apiRequest([figi + '_instrument', EXPIRATION_MAX], 'InstrumentsGetInstrumentBy', [idType, classCode, figi]).instrument
}

function _getinstrumentTypeByFigi(figi) {
  return _getInstrumentByFigi(figi).instrumentType
}

function _getMyFigiList() {
  const cacheKey = 'figiList'
  const cached = CACHE.get(cacheKey)
  if (cached != null) {
    Logger.log(`cacheKey ${cacheKey} found: ${cached}`)
    return JSON.parse(cached)
  }
  Logger.log(`cacheKey ${cacheKey} NOT found`)

  const accounts = JSON.parse(getAccounts())
  let figiSet = new Set()
  for (const account of accounts) {
    const {securities} = _getPositions(account.id)
    for (const security of securities) {
      figiSet.add(security.figi)
    }
  }
  let figiList = Array.from(figiSet);

  CACHE.put(cacheKey, JSON.stringify(figiList), EXPIRATION_DEFAULT)
  Logger.log('figilist: ' + figiList)
  return figiList
}

function _getPricesByFigiList(figiList) {
  return _apiRequest(['figiList_prices', EXPIRATION_DEFAULT], 'MarketDataGetLastPrices', [figiList]).lastPrices
}

function _quotationToNumber(units, nano) {
  return units + nano / NANO_FACTOR
}

/* ####################################################################################################### */

function getAccounts() {
  return JSON.stringify(_apiRequest(['accounts', EXPIRATION_MAX], 'UsersGetAccounts').accounts)
}

// dummy attribute is used for auto-refreshing the value each time the sheet is updating.
// see https://stackoverflow.com/a/27656313
function getAccountBalanceByCurrency(accountId, currency, dummy) {
  currency = currency.toLowerCase()
  // const positions = _getPositions(accountId).money
  const positions = _getPositions(accountId)
  const money = positions.money
  let blocked = positions.blocked || []
  let blocked_currency = blocked.find(x => x.currency === currency)
  if (blocked === [] || blocked_currency === undefined) {
    let dummy_object = new Object()
    dummy_object.currency = currency
    dummy_object.units = 0
    dummy_object.nano = 0
    blocked.push(dummy_object)
  } else {

  }
  const units = (Number(money.find(x => x.currency === currency).units) || 0) + (Number(blocked.find(x => x.currency === currency).units) || 0)
  const nano = (money.find(x => x.currency === currency).nano || 0) + (blocked.find(x => x.currency === currency).nano || 0)
  const result = _quotationToNumber(units, nano)
  Logger.log(`Available balance of ${currency} on ${accountId} account is: ${result}`)
  return result
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
  const figi = _getFigiByTicker(ticker)
  const figiList = _getMyFigiList()
  let lastPrices
  if (figiList.includes(figi)) {
    lastPrices = _getPricesByFigiList(figiList)
  } else {
    lastPrices = _apiRequest([ticker + '_price', EXPIRATION_DEFAULT], 'MarketDataGetLastPrices', [[figi]]).lastPrices
  }
  const price = lastPrices.find(x => x.figi === figi).price
  const units = Number(price.units) || 0
  const nano = price.nano || 0
  let resultPrice = _quotationToNumber(units, nano)

  // Bonds prices are counted differently
  // https://tinkoff.github.io/investAPI/faq_marketdata/#_4
  if (_getinstrumentTypeByFigi(figi) === 'bond') {
    const nominal = Number(_getBondByFigi(figi).nominal.units)
    resultPrice = resultPrice / 100 * nominal
  }

  Logger.log(ticker + ' price : ' + resultPrice)
  return resultPrice
}

/* ####################################################################################################### */

function onEdit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
  sheet.getRange('Z1').setValue(Math.random())
}
