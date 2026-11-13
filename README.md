# {{name}}

{{Одно-два предложения: что делает плагин и для кого.}}

## Установка

Плагин публикуется в каталоге студии [relatetest/hub](https://github.com/relatetest/hub). Один раз подготовьте git по [инструкции каталога](https://github.com/relatetest/hub#установка) (`gh auth login`, `gh auth setup-git`), затем:

```bash
claude plugin marketplace add relatetest/hub
```

```bash
claude plugin install {{name}}@relate
```

Codex, Cursor и другие агенты — тег из колонки «Версия» в каталоге:

```bash
npx skills add relatetest/{{name}}@v0.1.0 -g -a codex --copy
```

{{Если нужны дополнительные шаги — ключ MCP-сервера, локальный сервер, Figma-плагин, — опишите их здесь по порядку. Если не нужны, удалите этот абзац.}}

## Как пользоваться

{{Два-три настоящих запроса и что получится. Для ручных скиллов — как вызвать: /{{name}}:relate-…}}

## Скиллы

Таблица собирается из frontmatter командой `npm run build`.

<!-- catalog:start -->
Скиллов пока нет. Первый создаётся командой `npm run new -- <имя> --type knowledge --owner @login --category <категория>`.
<!-- catalog:end -->

## Как устроено

{{Что внутри: скиллы, скрипты, MCP-сервер, внешние сервисы. Куда плагин ходит в сеть и какие данные отправляет. Ревьюер в hub читает этот раздел первым.}}

## Разработка

```bash
npm run new -- <имя> --type knowledge --owner @login --category design
```

Создаёт скилл и eval-кейсы из шаблона. Типы: `knowledge`, `workflow`, `review`.

```bash
npm run check
```

Проверка по гайдлайну. Затем `claude --plugin-dir .` — запустить плагин из этой папки и попробовать на настоящих запросах.

- Как писать скиллы: [гайдлайн](https://github.com/relatetest/skills/blob/main/docs/guideline.md).
- Как выпустить релиз и попасть в каталог: [publishing.md](https://github.com/relatetest/hub/blob/main/docs/publishing.md).

## Владелец

{{owner}}, заместитель — {{@login}}
