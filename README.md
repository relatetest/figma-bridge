# figma-bridge

Мост между ИИ-агентом и Figma: плагин relate→←figma и маленький локальный сервер. Агент (Claude Code, Codex, Cursor и любой, кто умеет запускать команды) работает прямо в твоём открытом файле: читает слои, строит фреймы, правит текст, ставит картинки, экспортирует PNG, SVG, PDF. Figma MCP не нужен. Работает на macOS и Windows, в Figma Design, FigJam, Slides и Dev Mode.

Агент берёт мост сам, когда официальный Figma MCP не подключён, просит авторизацию или падает, и всегда, когда ты прямо просишь «через мост».

## Установка

Нужны Node.js 18 или новее (https://nodejs.org, версия LTS) и настольное приложение Figma: в браузере плагины разработчика не запускаются.

### 1. Скилл в агента

Claude Code, из каталога студии [relatetest/hub](https://github.com/relatetest/hub). Один раз подготовь git по [инструкции каталога](https://github.com/relatetest/hub#установка) (`gh auth login`, `gh auth setup-git`), затем:

```bash
claude plugin marketplace add relatetest/hub
```

```bash
claude plugin install figma-bridge@relate
```

Codex, Cursor и другие агенты:

```bash
npx skills add relatetest/figma-bridge@v0.1.0 -g -a codex --copy
```

Без `-g` скилл встанет только в текущий проект.

### 2. Мост и плагин в Figma

При первой просьбе про Figma агент сам запустит установщик. Он кладёт мост в одну постоянную папку: `~/.relate/figma-bridge` на Mac, `C:\Users\<ты>\.relate\figma-bridge` на Windows (другую можно задать переменной `RELATE_FIGMA_BRIDGE`). Постоянная папка нужна потому, что Figma запоминает путь к плагину: обновления скилла меняют только файлы внутри неё.

От тебя один раз: Figma → Plugins → Development → Import plugin from manifest… и файл `plugin/manifest.json` из этой папки. Агент назовёт точный путь. Для Dev Mode так же импортируй `plugin-dev/manifest.json`.

### 3. Правило в проект или в агента

Скилл подхватывается по описанию. Если хочешь, чтобы правило «Figma MCP недоступен или просят мост, значит работаем через мост» всегда лежало в инструкциях, попроси агента «пропиши figma-bridge в этот проект» или запусти из папки проекта:

```bash
node ~/.relate/figma-bridge/install.mjs --project .
```

Команда допишет короткий блок в `AGENTS.md` проекта (его читают Codex, Cursor и другие) и в `CLAUDE.md`. Если `CLAUDE.md` нет, создаст его с одной строкой `@AGENTS.md`. Флаг `--global` пишет то же в твои общие инструкции: `~/.claude/CLAUDE.md` и `~/.codex/AGENTS.md`. Флаг `--remove` убирает блок, `--dry-run` показывает, что изменится. Блок стоит между метками `relate-figma-bridge:start` и `end`, повторный запуск обновляет его на месте. На Windows в PowerShell пиши полный путь: `node $HOME\.relate\figma-bridge\install.mjs --project .`

## Как пользоваться

1. Открой файл в Figma и запусти плагин: Plugins → Development → relate→←figma.
2. Пиши агенту как обычно:
   - «Поменяй заголовок на выделенном фрейме на «Swap faster» и выгрузи его в PNG».
   - «Через мост: собери из выделенных экранов борд 3 на 2 с подписями».
   - «Посмотри страницу Components и скажи, каких состояний не хватает у кнопки».
3. Сервер агент запускает сам. В окне плагина видно, что он делает: стрелка летит к фрейму, который сейчас меняется, внизу журнал команд.

Каждая команда агента — отдельный шаг отмены (Cmd+Z или Ctrl+Z). Команда, которая упала с ошибкой, не откатывается, поэтому перед крупными правками агент сохраняет версию в истории файла.

Сервер можно запустить и самому: двойной щелчок по `Start Bridge.command` (Mac) или `Start Bridge.bat` (Windows) в папке моста.

## Скиллы

Таблица собирается из frontmatter командой `npm run build`.

<!-- catalog:start -->
### Дизайн и интерфейсы

| Скилл | Что делает | Запуск | Статус | Владелец |
|---|---|---|---|---|
| [`relate-figma-bridge`](skills/relate-figma-bridge/SKILL.md) | Drives the person's open Figma file live through the studio's local relate→←figma plugin and bridge (fig.js): read, create and edit frames, components, variables, text and images, export PNG, SVG, PDF. | сам и по имени | пробный | @Piwqust |
<!-- catalog:end -->

## Как устроено

- Один скилл `relate-figma-bridge`. Сам мост лежит в `skills/relate-figma-bridge/assets/bridge/`: `server.js`, `fig.js` и плагин для Figma. Установщик `skills/relate-figma-bridge/scripts/install.mjs` копирует его в папку моста и пишет туда `AGENTS.md`, ту же инструкцию для агентов без скиллов.
- Сеть. Сервер слушает только `127.0.0.1:3055` и `::1:3055`, наружу не ходит. Манифест плагина разрешает только `localhost:3055`. Агент обращается к серверу с токеном из `.token`, новым при каждом запуске. Плагин сервер узнаёт по origin окна плагина Figma, запросы с сайтов получают 403. Ничего не скачивается и не отправляется в интернет.
- Что пишет на диск. Папку моста (`~/.relate/figma-bridge` или `RELATE_FIGMA_BRIDGE`) и экспорты в `shots/` внутри неё или в папку из `--out`. В `AGENTS.md` и `CLAUDE.md` установщик пишет только с флагами `--project` и `--global`.
- Код агента выполняется внутри плагина в Figma с правами обычного плагина разработчика: читать и менять открытый файл, библиотеки команды, которые включены в этом файле.
- Без хуков, MCP-серверов и `allowed-tools`.

## Если что-то не работает

| Что видишь | Что сделать |
|---|---|
| В окне плагина «сервер не запущен» | Попроси агента запустить мост или дважды щёлкни `Start Bridge` в папке моста |
| Плагина нет в Plugins → Development | Не импортирован: Import plugin from manifest… и `plugin/manifest.json` из папки моста |
| `EADDRINUSE` при запуске сервера | Сервер уже запущен в другом окне. Плагин работает только с портом 3055 |
| `node: command not found` | Поставь Node.js LTS с nodejs.org и открой терминал заново |
| Mac не открывает `Start Bridge.command` | Системные настройки → Конфиденциальность и безопасность → «Всё равно открыть», или в Терминале `node ~/.relate/figma-bridge/server.js` |
| `readOnly: true`, правки падают | Файл в Dev Mode: переключись в Design (Shift+D) и открой обычный relate→←figma |

## Разработка

Код моста правится только в `skills/relate-figma-bridge/assets/bridge/`, копии в папке моста перезаписываются при установке.

```bash
npm test
```

Офлайн-тесты: установщик на временной папке, блок правил в проекте, сервер и `fig.js` с поддельным плагином на порту 3099. Figma не нужна.

```bash
npm run check
```

Проверка по гайдлайну. Затем `claude --plugin-dir .`: запустить плагин из этой папки и попробовать на настоящих запросах.

- Как писать скиллы: [гайдлайн](https://github.com/relatetest/skills/blob/main/docs/guideline.md).
- Как выпустить релиз и попасть в каталог: [publishing.md](https://github.com/relatetest/hub/blob/main/docs/publishing.md).

## Владелец

@Piwqust, заместителя пока нет.
