# AGENTS.md

Guidance for AI coding agents (Claude, Codex, Cursor, …) working in this repository.
Keep this file short and current — it is loaded into every agent session.

## What this is

**lunuc** is a full-stack framework/CMS for progressive web apps:
Node.js + Express, GraphQL API, MongoDB, React/Preact client (MUI in admin), Webpack, Jest.
Most features live in **extensions** that plug into core via a **hook system**.

## Repository map

| Path | Purpose |
|------|---------|
| `api/` | GraphQL API server. Entry `api/index.mjs` / `index.cjs` → `server.mjs`. Core `schema/` + `resolver/` (User, KeyValue, System, …). `resolver/generic/` = generic CRUD for types. |
| `server/` | Web/SSR server that serves the client (`server/index.mjs`). |
| `client/` | React client: `components/`, `containers/`, `store/`, `middleware/`, `util/`. |
| `extensions/<name>/` | Feature modules (cms, media, post, shop, mailclient, bot, …). See below. |
| `util/` | Shared helpers for api, server and client (`hook.cjs`, `hookAsync.mjs`, `i18n.mjs`, `config.mjs`, `deepMerge.mjs`, …). |
| `gensrc/` | **Generated** by `webpack.gensrc.js` (config, extension manifests, schema). Never edit by hand. |
| `test/` | Jest tests: `unit/`, `api/`. |
| `shell/` | Install/start scripts for Ubuntu/systemd deployments. |
| `buildconfig.json` | Default build config: which extensions are active, options, UI icons. Overridden by `/etc/lunuc/buildconfig.json` on servers. |
| `doc.md` | Framework docs: type definitions, field properties, hooks, CMS data resolver. **Read it before touching types or hooks.** |

## Extensions

Typical layout (not every file is required):

```
extensions/<name>/
├── extension.json     # name, description, lazyLoad, dependencies
├── build.json         # type definitions (→ MongoDB collections + generated GraphQL/CRUD), see doc.md
├── server.mjs         # API side: registers schema/resolver/indexes via Hook.on(...)
├── root-server.mjs    # optional: hooks into the web server (server/)
├── client.js          # client hooks (public)
├── client-admin.js    # client hooks (admin UI: menu entries, routes, form fields)
├── schema/index.mjs   # GraphQL SDL as template string
├── resolver/index.mjs # export default db => ({Query: {...}, Mutation: {...}})
├── components/, containers/, translations/, util/, constants/
```

- Activation: `buildconfig.json` → `extensions.<name>.active`. Generated manifests land in `gensrc/`.
- Server registration pattern (see `extensions/post/server.mjs`):
  ```js
  Hook.on('resolver', ({db, resolvers}) => deepMergeToFirst(resolvers, resolver(db)))
  Hook.on('schema', ({schemas}) => schemas.push(schema))
  Hook.on('index', ({db}) => { /* create mongodb indexes */ })
  ```
- Prefer declaring data types in `build.json` (generic resolver is generated) over hand-written schema/resolvers.
- Use `GenericResolver` (`api/resolver/generic/genericResolver.mjs`) for list/CRUD queries.
- Access control: `Util.checkIfUserIsLoggedIn(context)` / capability checks (`Util.hasCapability`) in resolvers and admin UI.
- Use the smallest extension as a template: `extensions/post`.

## Hooks

`Hook.on('Name', fn)` / `Hook.call(...)` from `util/hook.cjs` (async variant `util/hookAsync.mjs`).
`Hook.on('Name.key', fn)` registers only once per key. Full list of client and server hooks in `doc.md`
(e.g. `Routes`, `MenuMenu`, `TypeCreateEdit`, `appready`, `typeUpdated_<Type>`, `typeBeforeCreate`).

## Commands

```bash
npm install
npm run start:dev     # api:dev (nodemon, port 3001) + client:dev (webpack serve)
npm run api:dev       # API only
npm run client:dev    # client only
npm run build         # production client build
npm test              # starts temporary mongod on :27018, runs jest, cleans up
npm run lint          # eslint
```

Requires `MONGO_URL` (e.g. `mongodb://localhost:27017/lunuc`).

## Conventions

- **ES modules**: server-side files are `.mjs`; `.cjs` only where CommonJS is required (`util/hook.cjs`, `api/index.cjs`). Client files are `.js`.
- **Style (eslint)**: single quotes, **no semicolons**, unix line endings, 4-space indent.
- **Language**: code, comments, identifiers and commit messages in English. UI strings go through translations (`registerTrs`, `translations/`), languages de/en/fr/it, default `de`.
- Client import aliases: `util/…`, `client/…`, `gen/…` (→ `gensrc/`), defined in `babel.config.json` (module-resolver). In production builds `react`/`react-dom` are aliased to `preact/compat` (`webpack.config.js`).
- Globals: `_app_` (app state, user, config, language) exists on client and in API/SSR — don't introduce new globals.
- Keep changes minimal and local to the extension; don't refactor unrelated code.

## Do not touch / ignore

- `gensrc/`, `extensions/*/gensrc/` — generated, regenerate via build instead.
- `node_modules/`, `build/`, `build_api/`, `backups/`, `projectFilesBackup/`, `uploads/`, `static_private/`, `local_tmp/`, `mongodb_tmp/`, `_neu/`, `neuer ordner/`, `Claude outputs/`.
- `server/*.key`, `*.pem`, `*.crt` — certificates, never read out or modify.
- `index.min.html` — minified build output.

## Gotchas

- Server config is merged from `buildconfig.json` and `/etc/lunuc/buildconfig.json`; behaviour can differ per host (see `hostrules/`, `util/hostrules.mjs`).
- After adding an extension or changing `build.json`, the gensrc files must be regenerated (webpack build / dev server) before the API sees new types.
- Resolvers receive `db` (native MongoDB driver) — use `ObjectId` from `mongodb` for ids.
- API also renders React server-side (SSR) — avoid browser-only APIs at module top level.
