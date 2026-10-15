# 2gis-collector

[![tests](../../actions/workflows/tests.yml/badge.svg)](../../actions/workflows/tests.yml)

CLI на Node.js: собирает компании по нишам для одного города через официальный Catalog API 2ГИС и отдаёт
их в CSV, SQLite и JSON с отчётом по нишам. Нужен, когда требуется полная база «все стоматологии города»,
а не первая страница выдачи.

Сделан для замера «индекс цифровой доступности»: стоматологии Омска, 306 точек 2ГИС → 229 брендов
(методика и скилл для Claude Code — в [claude-skills](https://github.com/dobrewoks1/claude-skills)).
Работает только через официальный API, без скрапинга страниц. Выгрузки принадлежат 2ГИС и в репозиторий
не входят: `data/` и `output/` в `.gitignore`.

## Задача, которую решает

Одна ниша в 2ГИС — не одна рубрика: «стоматологии» это и «Стоматологические поликлиники», и «Частные
стоматологии». А один поисковый проход отдаёт ограниченное число страниц, так что по одному запросу на
нишу полной базы не получить. Поэтому сборщик:

- резолвит `region_id` по названию города (`/2.0/region/search`) и **набор рубрик** по названию ниши
  (`/2.0/catalog/rubric/search`);
- ищет через Places API (`/3.0/items`) по точкам `point + radius` постранично, пока не наберёт цель
  или не кончатся точки;
- если точек из файла не хватило — **сам строит сетку** вокруг центроида заданных точек (шаг ≈ 1,4 × radius,
  чтобы круги перекрывали площадь) и продолжает обход;
- дедуплицирует по `2gis_id`, а без него — по нормализованной паре «название + адрес»;
- сохраняет сырые ответы, нормализованный JSON, CSV (UTF-8 с BOM, открывается в Excel) и SQLite;
- печатает отчёт: сколько собрано по нише, сколько дублей убрано, какие точки дали больше всего,
  какие ниши не добрали цель (раздел «NICHES UNDER TARGET»).

Retry с backoff, лимит частоты запросов, таймауты и разбор ошибок API встроены в клиент.

Пример отчёта (пять ниш Омска, цель 100 фирм на нишу):

```
  NICHE                    FOUND/TARGET  MET   DUPES  POINTS  CALLS
  кофейни                    100/100   yes      0       1      2
  стоматологии               128/100   yes      0       2      3
  автосервисы                121/100   yes      0       2      3
  салоны красоты             100/100   yes      0       1      2
  юристы                     100/100   yes      0       1      2
```

## Быстрый старт

Нужен **Node.js 18+**; для выгрузки в SQLite — **22.5+** (встроенный `node:sqlite`, нативная сборка не
нужна; на более старом Node сборщик просто пропустит SQLite с предупреждением, CSV и JSON останутся).
Ключ Catalog API выдаётся в кабинете разработчика <https://dev.2gis.com/>; условия и лимиты зависят от тарифа.

```bash
npm ci                # axios, commander, dotenv
cp .env.example .env  # Windows PowerShell: Copy-Item .env.example .env
#   впишите TWOGIS_API_KEY=... — ключ живёт только в .env, в коде его нет

node src/index.js collect \
  --region "Omsk" \
  --niches "кофейни,стоматологии,автосервисы,салоны красоты,юристы" \
  --target-per-niche 100 \
  --points-file ./input/omsk_points.json \
  --output ./output

npm run collect:omsk  # то же самое, параметры зашиты в package.json
```

Windows PowerShell: перед командами с кириллицей выполните `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
иначе русские буквы в консоли отобразятся неверно (в файлы всё всегда пишется в UTF-8).

## CLI

```
node src/index.js collect [опции]
```

| Опция | По умолчанию | Описание |
|---|---|---|
| `--region <name>` | — (обязательно) | Город или регион, напр. `"Omsk"` или `"Омск"` |
| `--niches <list>` | 5 ниш по умолчанию | Список ниш через запятую |
| `--target-per-niche <n>` | `100` | Цель уникальных фирм на нишу |
| `--points-file <path>` | `./input/omsk_points.json` | JSON с точками поиска |
| `--output <dir>` | `./output` | Куда класть CSV, SQLite, отчёт, логи |
| `--no-auto-grid` | (выкл.) | Отключить авто-генерацию сетки точек |

Вспомогательные команды:

```bash
node src/index.js resolve-region --region "Omsk"                   # → { id, name }
node src/index.js resolve-rubric --region "Omsk" --niche "кофейни"  # → набор рубрик для ниши
npm run inspect                                                     # статистика по собранной SQLite-базе
```

## Ниши и координаты

- **Ниши** — параметр `--niches` или значение по умолчанию в `package.json` → `scripts.collect:omsk`.
  Ниша сопоставляется с рубриками 2ГИС автоматически; проверить сопоставление — `resolve-rubric`.
- **Точки** — файл `input/omsk_points.json`, `radius` в метрах:

  ```json
  { "region": "Omsk", "points": [ { "name": "Центр", "lat": 54.9893, "lon": 73.3682, "radius": 3000 } ] }
  ```

  Для другого города скопируйте файл, впишите свои точки и укажите его в `--points-file`.
- **Сетка** настраивается в `.env`: `GRID_RADIUS_M`, `GRID_HALF_WIDTH_M`, `GRID_HALF_HEIGHT_M`, `MAX_GRID_POINTS`.

## Что и куда сохраняется

| Артефакт | Путь |
|---|---|
| Сырые ответы API | `data/raw/<город>/<ниша>/<точка>_page-N_<ts>.json` |
| Нормализованный JSON по нише | `data/normalized/<ниша>.json`, все фирмы — `all_firms.json` |
| Итоговый CSV | `output/firms_<город>_<ts>.csv` |
| Итоговая SQLite | `output/firms_<город>.sqlite`, таблица `firms` |
| Отчёт | `output/report.json` и `output/report.md` |
| Логи | `output/logs/run-<ts>.log` |

Поля по каждой фирме: `niche`, `rubric_id`, `region_name`, `region_id`, `2gis_id`, `name`, `full_name`,
`address`, `lat`, `lon`, `url`, `website`, `phones`, `rating`, `reviews_count`, `schedule`, `raw_json_path`,
`collected_at`, `source_point`. В CSV `phones` склеены через `;`, `schedule` — JSON-строкой; в SQLite колонка
`2gis_id` называется `twogis_id` (идентификатор не может начинаться с цифры). Как выглядит CSV —
[`examples/sample_output.csv`](examples/sample_output.csv): 10 вымышленных строк, домены `example.*`.

## Настройки в `.env`

```
TWOGIS_API_KEY=...            # ключ 2ГИС
TWOGIS_BASE_URL=https://catalog.api.2gis.com
REQUEST_TIMEOUT_MS=15000      # таймаут запроса
RATE_LIMIT_MS=350             # минимальный интервал между запросами
MAX_RETRIES=4                 # повторы при 429/5xx и сетевых ошибках
LOG_LEVEL=info                # error | warn | info | debug
# PAGE_SIZE=50                # размер страницы (макс. 50)
# MAX_PAGES_PER_POINT=10      # сколько страниц тянуть с одной точки
# AUTO_GRID=true              # авто-сетка при нехватке
# GRID_RADIUS_M=2000  GRID_HALF_WIDTH_M=11000  GRID_HALF_HEIGHT_M=9000  MAX_GRID_POINTS=40
```

## Устройство

```
src/
  index.js            CLI (commander): collect / resolve-region / resolve-rubric
  config.js           .env, константы, пути
  api/client.js       axios: таймаут, retry с backoff, rate-limit, ошибки API
  api/regions.js      region resolver
  api/rubrics.js      rubric resolver: набор рубрик на нишу
  api/places.js       одна страница /3.0/items
  core/collector.js   оркестрация сбора по нише: точки → сетка → цель
  core/geoGrid.js     загрузка точек, генератор сетки
  core/normalize.js   raw item → плоская запись
  core/dedup.js       дедупликация
  storage/            rawStore, normalizedStore, csvExporter, sqliteExporter (node:sqlite)
  report.js           сборка и печать отчёта
test/                 node:test — dedup, geoGrid, normalize (чистые функции, без сети и ключа)
scripts/inspect_db.mjs   статистика по SQLite-базе
```

Новый экспорт (например, в Google Sheets) — ещё один модуль в `src/storage/` и вызов из `src/index.js`.

## Тесты и ограничения

`npm test` гоняет чистые функции без сети и ключа; CI (GitHub Actions) делает то же на Node 22.
`node:sqlite` помечен как экспериментальный, одно предупреждение при старте подавляется. Соблюдайте
условия использования 2ГИС и лимиты своего ключа: данные нельзя перепубликовывать.

## Как делалось

Собран в связке с Claude Code под конкретный замер: стратегия гео-дробления, правила дедупликации и формат
выгрузки — мои, код и тесты написаны агентом и проверены на реальном сборе.

Лицензия — MIT, см. [LICENSE](LICENSE).

---

**In English.** A Node.js CLI that collects businesses for a city by niche through the official 2GIS Catalog
API: it resolves the region and the set of rubrics for each niche, pages through search results around several
geo points (auto-generating a grid around the city centre when the target is not reached), deduplicates firms
and exports them to CSV, SQLite and JSON with a per-niche report. Retries with backoff, rate limiting and
timeouts are built in. You need your own API key from dev.2gis.com. Built for a real survey of 306 dental
clinics in Omsk.
