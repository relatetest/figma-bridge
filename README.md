# figma-bridge

Мост между ИИ-агентом и Figma: плагин relate→←figma и маленький локальный сервер. Агент (Claude Code, Codex, Cursor и любой, кто умеет запускать команды) работает прямо в твоём открытом файле: читает слои, строит фреймы, правит текст, ставит картинки, экспортирует PNG, SVG, PDF. Figma MCP не нужен. Работает на macOS и Windows, в Figma Design, FigJam, Slides и Dev Mode.

Агент берёт мост сам, когда официальный Figma MCP не подключён, просит авторизацию или падает, и всегда, когда ты прямо просишь «через мост».

## Установка

Самое простое: скопируй своему агенту (Claude Code, Codex, Cursor) эту фразу, он всё сделает сам:

```text
Установи мне мост Figma https://github.com/relatetest/figma-bridge по разделу «Для агента» в его README и скажи, что мне нажать в Figma.
```

Или одной командой в терминале, если стоит Node.js 18+ (https://nodejs.org, версия LTS):

```bash
npx -y github:relatetest/figma-bridge
```

Что она делает:

- кладёт мост в постоянную папку `~/.relate/figma-bridge` (на Windows `C:\Users\<ты>\.relate\figma-bridge`). Постоянная она потому, что Figma запоминает путь к плагину, и обновления его не ломают;
- ставит скилл `relate-figma-bridge` в `~/.claude/skills` (Claude Code) и `~/.agents/skills` (Codex, Cursor, Copilot, Gemini CLI, OpenCode);
- дописывает в общие инструкции агентов (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) короткое правило: если официальный Figma MCP недоступен или просят мост, работать через мост. Без этого шага: `--no-rule`.

Потом от тебя один раз: в настольной Figma Plugins → Development → Import plugin from manifest… и файл `plugin/manifest.json` из папки моста. Команда напечатает точный путь. В браузерной Figma плагины разработчика не запускаются. После этого открой новую сессию агента, чтобы он увидел скилл.

Обновиться: запустить ту же команду ещё раз. Удалить: папку моста, папки `relate-figma-bridge` в `~/.claude/skills` и `~/.agents/skills`, и блок между метками `relate-figma-bridge:start` и `end` в инструкциях.

### Правило в конкретный проект

Чтобы правило лежало в инструкциях проекта и работало у всех, кто его открывает, запусти из папки проекта:

```bash
npx -y github:relatetest/figma-bridge --project .
```

Команда допишет блок в `AGENTS.md` проекта и в `CLAUDE.md`. Если `CLAUDE.md` нет, создаст его с одной строкой `@AGENTS.md`. Повторный запуск обновляет блок на месте, `--dry-run` показывает, что изменится. Можно и просто сказать агенту «пропиши figma-bridge в этот проект».

### Для студии: каталог relate

Внутри Relate плагин ставится и из каталога [relatetest/hub](https://github.com/relatetest/hub):

```bash
claude plugin install figma-bridge@relate
```

## Для агента

Steps for an AI agent asked to install this. Run them yourself; the person only clicks in Figma.

1. Check `node -v`. If Node.js is missing or older than 18, ask the person to install the LTS from https://nodejs.org (or install it with `winget install OpenJS.NodeJS.LTS` on Windows, `brew install node` on macOS, if they allow it), then continue.
2. Run `npx -y github:relatetest/figma-bridge`. Add `--project <dir>` if the person wants the rule in a project. If `npx` cannot fetch from GitHub (no git), download https://github.com/relatetest/figma-bridge/archive/refs/heads/main.zip, unpack it to a temporary folder and run `node <folder>/scripts/quick-install.mjs` with the same flags.
3. Read the JSON it prints. Tell the person, in their language, the one click left: Figma desktop → Plugins → Development → Import plugin from manifest… → the `manifest` path. Never click in their Figma yourself.
4. Tell the person to start a new agent session so the `relate-figma-bridge` skill loads. From then on, follow that skill for any Figma work.

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
- Сеть. Сервер слушает только `127.0.0.1:3055` и `::1:3055`, наружу не ходит. Манифест плагина разрешает только `localhost:3055`. Агент обращается к серверу с токеном из `.token`, новым при каждом запуске. Плагин сервер узнаёт по origin окна плагина Figma, запросы с сайтов получают 403. Во время работы ничего не скачивается и не отправляется в интернет; из сети приходит только сам репозиторий, когда ты запускаешь `npx`.
- Что пишет на диск. Папку моста (`~/.relate/figma-bridge` или `RELATE_FIGMA_BRIDGE`) и экспорты в `shots/` внутри неё или в папку из `--out`. Команда `npx` ещё копирует скилл в `~/.claude/skills` и `~/.agents/skills` и пишет блок правила в `~/.claude/CLAUDE.md` и `~/.codex/AGENTS.md`, если не указан `--no-rule`. Сам установщик скилла трогает `AGENTS.md` и `CLAUDE.md` только с флагами `--project` и `--global`, и только между метками `relate-figma-bridge:start` и `end`.
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
