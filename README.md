# GAS Tinkoff Trades
![GAS Tinkoff Trades main image](https://github.com/ErhoSen/gas-tinkoff-trades/raw/master/images/main-image.jpg "GAS Tinkoff Trades main image")

Данный [Google Apps Script](https://developers.google.com/apps-script) предназначен для импорта сделок из Тинькофф Инвестиций прямо в Google таблицы, для последующего анализа. 

Я ~~сделал~~ _форкнул и допилил_ этот скрипт для автоматизации ручного вбивания данных из приложения тинькофф, и надеюсь он окажется полезен кому-нибудь ещё :)

## Установка

* Создать или открыть документ Google Spreadsheets http://drive.google.com
* В меню "Tools" выбрать "Script Editor"
* Дать проекту имя, например `TinkoffTrades`
* Для работы с **API v1** (aka [invest-openapi](https://github.com/Tinkoff/invest-openapi))
    * Скопировать код из `Code-api-v1.gs`
    * Получить [API-токен тинькофф](https://tinkoff.github.io/invest-openapi/auth/)
* Для работы с **API v2** (aka [investAPI](https://github.com/Tinkoff/investAPI))
    * Добавить код [отсюда](https://raw.githubusercontent.com/kdeyko/Tinkoff-REST-API-via-Google-Apps-Script/main/TinkoffApp.gs). Можно добавить в отдельный файл, но нужно убедиться, что этот файл будет первым в списке.
    * Скопировать код из `Code-api-v2.gs`
    * Получить [API-токен тинькофф](https://tinkoff.github.io/investAPI/token/). Используйте read-only токен, если не требуется автоматизировать торговлю.
* Добавить свойство `API_TOKEN` в разделе `File -> Project properties -> Script properties` равным токену, полученному выше. 
* Сохранить скрипт 💾

На этом всё. Теперь при работе с этим документом на всех листах будут доступны новые функции, описанные ниже (в API v2 доступны не все функции).

## Функции

* `=getPriceByTicker(ticker, dummy)` - Получить последнюю цену (`lastPrice`) указанного инструмента по тикеру. Требует на вход [тикер](https://ru.wikipedia.org/wiki/%D0%A2%D0%B8%D0%BA%D0%B5%D1%80) и опциональный параметр `dummy`. Для автоматичекого обновления необходимо указать в качестве `dummy` ячейку `Z1`. 

* `=getNameByTicker(ticker, dummy)` - Получить имя указанного инструмента по тикеру. Требует на вход [тикер](https://ru.wikipedia.org/wiki/%D0%A2%D0%B8%D0%BA%D0%B5%D1%80) и опциональный параметр `dummy`. Для автоматичекого обновления необходимо указать в качестве `dummy` ячейку `Z1`. 

* `=getCurrencyByTicker(ticker, dummy)` - Получить валюту (`currency`) указанного инструмента по тикеру. Требует на вход [тикер](https://ru.wikipedia.org/wiki/%D0%A2%D0%B8%D0%BA%D0%B5%D1%80) и опциональный параметр `dummy`. Для автоматичекого обновления необходимо указать в качестве `dummy` ячейку `Z1`. 

* `=getTrades(ticker, from, to)` - требует на вход [тикер](https://ru.wikipedia.org/wiki/%D0%A2%D0%B8%D0%BA%D0%B5%D1%80) и опционально фильтрацию по времени. Параметры `from` и `to` являются строками и должны быть в [ISO 8601 формате](https://ru.wikipedia.org/wiki/ISO_8601)
---
**NOTA BENE**: Следующие функции работают непосредственно с портфелем пользователя. Данные о портфеле собираются одним запросом и хранятся в кэше (см. переменную `EXPIRATION_IN_SECONDS`, по умолчанию 10 сек).

* `=getAccounts()` - Вспомогательная функция для получения счетов (`brokerAccountType`,`brokerAccountId`) пользователя: брокерские и ИИС. 

* `=getAccountBalanceByTicker(accountId, ticker, dummy)` - Получить баланс указанного инструмента в указанном аккаунте по тикеру и accountId. Требует на вход `accountId` (можно получить с помощью функции `getAccounts()`), [тикер](https://ru.wikipedia.org/wiki/%D0%A2%D0%B8%D0%BA%D0%B5%D1%80) и опциональный параметр `dummy`. Для автоматичекого обновления необходимо указать в качестве `dummy` ячейку `Z1`. 

* `=getAccountBalanceByCurrency(accountId, currency, dummy)` - Получить баланс указанной валюты в указанном аккаунте по имени валюты и accountId. Требует на вход `accountId` (можно получить с помощью функции `getAccounts()`), `currency` (RUB, USD, EUR, etc.) и опциональный параметр `dummy`. Для автоматичекого обновления необходимо указать в качестве `dummy` ячейку `Z1`. 

## Особенности

* Скрипт резервирует ячейку `Z1` (самая правая ячейка первой строки), в которую вставляет случайное число на каждое изменении листа. Данная ячейка используется в функции `getPriceByTicker`, - она позволяет [автоматически обновлять](https://stackoverflow.com/a/27656313) текущую стоимость тикера при обновлении листа.

* Среди настроек скрипта есть `TRADING_START_AT` - дефолтная дата, начиная с которой фильтруются операции `getTrades`. По умолчанию это `Apr 01, 2020 10:00:00`, но данную константу можно в любой момент поменять в исходном коде.

## Пример использования 

```
=getPriceByTicker("V", Z1)  # Возвращает текущую цену акции Visa
=getPriceByTicker("FXMM", Z1)  # Возвращает текущую цену фонда казначейских облигаций США

=getTrades("V") 
# Вернёт все операции с акцией Visa, которые произошли начиная с TRADING_START_AT и по текущий момент.
=getTrades("V", "2020-05-01T00:00:00.000Z") 
# Вернёт все операции с акцией Visa, которые произошли начиная с 1 мая и по текущий моментs.
=getTrades("V", "2020-05-01T00:00:00.000Z", "2020-05-05T23:59:59.999Z") 
# Вернёт все операции с акцией Visa, которые произошли в период с 1 и по 5 мая.
```

## Пример работы

#### `=getTrades()`
![getTrades in action](https://github.com/ErhoSen/gas-tinkoff-trades/raw/master/images/get-trades-in-action.gif "getTrades in Action")

#### `=getPriceByTicker()`
![Get price by ticker in action](https://github.com/ErhoSen/gas-tinkoff-trades/raw/master/images/get-price-by-ticker.gif)
