# twogis-catalog-collector

[![tests](../../actions/workflows/tests.yml/badge.svg)](../../actions/workflows/tests.yml)

> **English summary.** A Node.js CLI that collects businesses for a city by niche through the
> official 2GIS Catalog API (Categories + Places): it resolves the region and the set of rubrics
> for each niche by name, pages through search results around several geo points (auto-generating
> a grid around the city center when the target is not reached), deduplicates firms and exports
> them to CSV (UTF-8 with BOM), SQLite and JSON with a per-niche report. Retries with backoff,
> rate limiting and timeouts are built in. You need your own API key from <https://dev.2gis.com/>.
> Tests: `node:test`; CI on Node 22. Built together with Claude Code (an AI coding assistant).
> The rest of this README is in Russian.

Сборщик компаний из **2ГИС** через официальный Catalog API (Categories + Places).
Собирает по N уникальных фирм в нескольких нишах для одного города, обходя
ограничение на число страниц в одном поиске за счёт **гео-дробления**, делает
дедупликацию и выгружает результат в **CSV** и **SQLite**.

Работает только через официальный API — никакого браузерного скрапинга.
Собранные данные принадлежат 2ГИС: соблюдайте условия использования API и не
публикуйте выгрузки (поэтому `data/` и `output/` в `.gitignore`).

---

## Что делает

- Резолвит `region_id` по названию города (`/2.0/region/search`).
- Резолвит **набор рубрик** по названию ниши (`/2.0/catalog/rubric/search`).
  Одна ниша ≠ одна рубрика: «стоматологии» это и `Стоматологические поликлиники`,
  и `Частные стоматологии` — сборщик запрашивает их вместе.
- Ищет фирмы через Places API (`/3.0/items`) по точкам `point`+`radius`,
  постранично, пока не наберёт цель или не кончатся точки.
- **Гео-дробление**: проходит по заданным координатам, а если данных не хватило —
  автоматически генерирует сетку соседних точек вокруг центра города.
- Дедуплицирует по `2gis_id`, а при его отсутствии — по нормализованной паре
  `name + address`.
- Сохраняет сырые ответы, нормализованный JSON, CSV и SQLite.
- Логирование, retry с backoff, таймауты, rate-limiting, обработка ошибок API.
- Итоговый отчёт: сколько собрано по каждой нише, сколько дублей удалено, какие
  точки дали больше всего результатов, какие ниши не добрали цель.

---

## Требования

- **Node.js 18+** для сбора, CSV и JSON.
- **Node.js 22.5+** для выгрузки в SQLite (используется встроенный `node:sqlite`,
  нативная сборка не нужна). На более старом Node сборщик отработает и просто
  пропустит SQLite-выгрузку с предупреждением — CSV и JSON останутся.

Проверить версию: `node --version`.

---

## Установка

```bash
cd twogis-catalog-collector
npm ci               # ставит axios, commander, dotenv (без нативной сборки)
cp .env.example .env # Windows PowerShell: Copy-Item .env.example .env
```

Затем впишите свой ключ в `.env` (см. ниже).

---

## Ключ API

Ключ к Catalog API получают в кабинете разработчика 2ГИС:
<https://dev.2gis.com/>. Условия и лимиты зависят от тарифа — смотрите их там же.
Впишите ключ в `.env` (`TWOGIS_API_KEY=...`).

Ключ хранится только в `.env` (файл в `.gitignore`), в коде его нет.

---

## Быстрый старт — пример для Омска

```bash
# со всеми параметрами:
node src/index.js collect \
  --region "Omsk" \
  --niches "кофейни,стоматологии,автосервисы,салоны красоты,юристы" \
  --target-per-niche 100 \
  --points-file ./input/omsk_points.json \
  --output ./output

# или короче, через npm-скрипт (те же параметры зашиты внутри):
npm run collect:omsk
```

Пример итогового отчёта:

```
  NICHE                    FOUND/TARGET  MET   DUPES  POINTS  CALLS
  кофейни                    100/100   yes      0       1      2
  стоматологии               128/100   yes      0       2      3
  автосервисы                121/100   yes      0       2      3
  салоны красоты             100/100   yes      0       1      2
  юристы                     100/100   yes      0       1      2
```

> Windows PowerShell: перед запуском команд с кириллицей выполните
> `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`, чтобы в консоли
> корректно отображались русские буквы (в файлы всё всегда пишется в UTF-8).

---

## CLI

```
node src/index.js collect [опции]
```

| Опция | По умолчанию | Описание |
|---|---|---|
| `--region <name>` | — (обязательно) | Город/регион, напр. `"Omsk"` или `"Омск"` |
| `--niches <list>` | 5 ниш по умолчанию | Список ниш через запятую |
| `--target-per-niche <n>` | `100` | Цель уникальных фирм на нишу |
| `--points-file <path>` | `./input/omsk_points.json` | JSON с точками поиска |
| `--output <dir>` | `./output` | Куда класть CSV, SQLite, отчёт, логи |
| `--no-auto-grid` | (выкл.) | Отключить авто-генерацию сетки точек |

Вспомогательные команды:

```bash
node src/index.js resolve-region --region "Omsk"                 # -> { id, name }
node src/index.js resolve-rubric --region "Omsk" --niche "кофейни" # -> набор рубрик
npm run inspect             # статистика по собранной SQLite-базе
```

---

## Где менять ниши и координаты

- **Ниши** — параметр `--niches` (через запятую) или значение по умолчанию в
  `package.json` → `scripts.collect:omsk`. Ниша сопоставляется с рубриками 2ГИС
  автоматически; проверить сопоставление можно командой `resolve-rubric`.
- **Координаты точек** — файл `input/omsk_points.json`:

  ```json
  {
    "region": "Omsk",
    "points": [
      { "name": "Центр", "lat": 54.9893, "lon": 73.3682, "radius": 3000 }
    ]
  }
  ```

  `radius` в метрах. Для другого города скопируйте файл (например
  `input/moscow_points.json`), впишите свои точки и укажите его в `--points-file`.

---

## Стратегия гео-дробления

API 2ГИС может отдавать ограниченное число страниц на один поисковый проход,
поэтому нельзя полагаться на один запрос по нише. Логика такая:

1. Для ниши берётся набор рубрик и идёт постраничный поиск (`page_size` до 50)
   по каждой точке из `points-file` с её `radius`.
2. `point` ограничивает выдачу небольшой областью, поэтому разные точки дают
   разные фирмы; после каждой точки — дедупликация.
3. Как только набрана цель — переход к следующей нише.
4. Если по заданным точкам цель не набрана и `--no-auto-grid` не указан —
   генерируется квадратная сетка точек вокруг центроида заданных точек
   (шаг ≈ `1.4 × radius`, чтобы круги перекрывали площадь) и обход продолжается.
5. Если цель всё равно не набрана — это явно фиксируется в отчёте
   (раздел «NICHES UNDER TARGET»).

Параметры сетки настраиваются в `.env` (`GRID_RADIUS_M`, `GRID_HALF_WIDTH_M`,
`GRID_HALF_HEIGHT_M`, `MAX_GRID_POINTS`).

---

## Что и куда сохраняется

| Артефакт | Путь |
|---|---|
| Сырые ответы API | `data/raw/<город>/<ниша>/<точка>_page-N_<ts>.json` |
| Нормализованный JSON по нише | `data/normalized/<ниша>.json` |
| Все фирмы одним файлом | `data/normalized/all_firms.json` |
| Итоговый CSV | `output/firms_<город>_<ts>.csv` (UTF-8 с BOM, открывается в Excel) |
| Итоговая SQLite | `output/firms_<город>.sqlite` (таблица `firms`) |
| Отчёт | `output/report.json` и `output/report.md` |
| Логи | `output/logs/run-<ts>.log` |

Поля по каждой фирме: `niche`, `rubric_id`, `region_name`, `region_id`,
`2gis_id`, `name`, `full_name`, `address`, `lat`, `lon`, `url`, `website`,
`phones`, `rating`, `reviews_count`, `schedule`, `raw_json_path`,
`collected_at`, `source_point`.

Как выглядит CSV — см. [`examples/sample_output.csv`](examples/sample_output.csv)
(10 вымышленных строк: названия, адреса, телефоны и ссылки выдуманы, домены `example.*`).

В CSV `phones` склеены через `;`, `schedule` — JSON-строкой. В SQLite колонка
`2gis_id` называется `twogis_id` (SQL-идентификатор не может начинаться с цифры).

---

## Структура проекта

```
twogis-catalog-collector/
├── .github/workflows/tests.yml # CI: npm test на Node 22
├── examples/
│   └── sample_output.csv       # пример выгрузки (10 вымышленных строк)
├── input/
│   └── omsk_points.json        # точки поиска (координаты + радиус)
├── src/
│   ├── index.js                # CLI (commander): collect / resolve-region / resolve-rubric
│   ├── config.js               # .env, константы, пути
│   ├── logger.js               # логи в консоль + файл
│   ├── util.js                 # slug, нормализация, время
│   ├── api/
│   │   ├── client.js           # axios: таймаут, retry/backoff, rate-limit, ошибки API
│   │   ├── regions.js          # region resolver
│   │   ├── rubrics.js          # rubric resolver (набор рубрик на нишу)
│   │   └── places.js           # places collector (одна страница /3.0/items)
│   ├── core/
│   │   ├── geoGrid.js          # загрузка точек + генератор сетки
│   │   ├── normalize.js        # raw item -> плоская запись
│   │   ├── dedup.js            # дедупликация
│   │   └── collector.js        # оркестрация сбора по нише
│   ├── storage/
│   │   ├── rawStore.js         # сырые ответы в data/raw
│   │   ├── normalizedStore.js  # нормализованный JSON
│   │   ├── csvExporter.js      # CSV-экспорт
│   │   └── sqliteExporter.js   # SQLite-экспорт (node:sqlite)
│   └── report.js               # сборка и печать отчёта
├── scripts/
│   └── inspect_db.mjs          # статистика по SQLite-базе
├── test/                       # node:test — dedup, geoGrid, normalize
├── data/{raw,normalized}/      # результаты сбора (не в git)
├── output/                     # CSV, SQLite, отчёт, логи (не в git)
├── .env.example
└── package.json
```

---

## Тюнинг через `.env`

```
TWOGIS_API_KEY=...            # ключ 2ГИС
TWOGIS_BASE_URL=https://catalog.api.2gis.com
REQUEST_TIMEOUT_MS=15000      # таймаут запроса
RATE_LIMIT_MS=350             # минимальный интервал между запросами
MAX_RETRIES=4                 # число повторов при 429/5xx/сетевых ошибках
LOG_LEVEL=info                # error | warn | info | debug
# необязательные:
# PAGE_SIZE=50                 # размер страницы (макс. 50)
# MAX_PAGES_PER_POINT=10       # сколько страниц тянуть с одной точки
# AUTO_GRID=true               # авто-сетка при нехватке
# GRID_RADIUS_M=2000
# GRID_HALF_WIDTH_M=11000
# GRID_HALF_HEIGHT_M=9000
# MAX_GRID_POINTS=40
```

---

## Заметки и ограничения

- Используется только официальный Catalog API. Соблюдайте условия использования
  2ГИС и лимиты вашего ключа.
- `node:sqlite` помечен как экспериментальный — одно предупреждение при старте
  подавляется; на данные это не влияет.
- Код модульный: чтобы добавить, например, экспорт в Google Sheets — допишите
  модуль в `src/storage/` и вызовите его из `src/index.js`.

---

## Тесты

```bash
npm test   # node --test: чистые функции dedup, geoGrid, normalize, без сети и ключа
```

CI (GitHub Actions) запускает `npm ci` и `npm test` на Node 22.

---

## Об авторстве

- **Разработано в связке с Claude Code** (ИИ-ассистент для программирования):
  задачи ставил и результат проверял я, код, тесты и документация написаны
  вместе с ИИ.
- Лицензия — MIT, см. [LICENSE](LICENSE).
