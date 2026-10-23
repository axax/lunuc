/*
 * Guide for AI coding assistants (Claude Code, Codex, Cursor, ...) that is added to a
 * CmsPage ZIP export: AGENTS.md (read by most agents), CLAUDE.md (imports AGENTS.md)
 * and the Lunuc framework reference from static/ai/lunuc in _lunuc/.
 *
 * The import ignores all of these files (only page folders with page.json and the
 * known page files are read, see readCmsPagesZip), so an edited export can be
 * zipped and imported again as it is.
 */
import fs from 'fs'
import path from 'path'
import config from '../../../gensrc/config.mjs'

export const AI_GUIDE_DOCS_FOLDER = '_lunuc'

// static/ai/lunuc files worth shipping, with what they are for. component-changes.md
// (change format of the in-app chat) and the older components.md / types.md are left out.
const AI_GUIDE_DOCS = [
    {file: 'components-specification.md', about: 'main reference: template (JsonDom), dataResolver, script, style, serverScript - read first'},
    {file: 'architecture.md', about: 'how the five parts of a page work together'},
    {file: 'reduce-reference.md', about: 'the "reduce" block of a dataResolver'},
    {file: 'serverscript-reference.md', about: 'serverScript methods, GenericResolver'},
    {file: 'util-reference.md', about: 'Util / DomUtil helpers (dates, formatting, resources)'},
    {file: 'types-reference.md', about: 'generic data types (GenericDataDefinition)'}
]

const docsDir = () => path.join(path.resolve(), config.STATIC_DIR, 'ai', 'lunuc')

const agentsMd = (docs) => `# Lunuc CmsPages - guide for AI assistants

This folder is an export of pages ("CmsPages") of a website that runs on the
**Lunuc** CMS. The files are edited here and the result is imported again
(Lunuc admin -> Pages -> "Import pages from files (ZIP)").

## Layout

Every folder that contains a \`page.json\` is one page - see \`README.md\` for
the table of files. In short:

| File | Runs | Content |
|---|---|---|
| \`page.json\` | - | attributes; \`slug\` identifies the page on import |
| \`template.json\` | client + server (SSR) | the page as JsonDom JSON (\`t\` tag, \`p\` props, \`c\` children, \`$for\`, \`\${...}\` expressions) |
| \`dataResolver.json\` | server | data loading (JSON array of resolver blocks) |
| \`script.js\` | browser | client script (\`scope\`, \`on(...)\`, \`forceUpdate()\`, \`serverMethod()\`, \`Util\`, \`DomUtil\`) |
| \`serverScript.js\` | server | methods callable from the client via \`serverMethod('name', args)\` |
| \`style.css\` | browser | nested CSS |
| \`resources.json\` | browser | external scripts / styles (optional) |
| \`manual.md\` | - | documentation of the page (optional) - keep it up to date when you change the page |

## Framework reference

Read \`${AI_GUIDE_DOCS_FOLDER}/components-specification.md\` before changing a page. Load the
others when the task touches their topic:

${docs.map(d => `- \`${AI_GUIDE_DOCS_FOLDER}/${d.file}\` - ${d.about}`).join('\n')}

These documents were written for the chat assistant built into Lunuc. **Where they
talk about output, they do not apply here:**

- Ignore the output formats (\`<lunuc_component>\` blocks, \`key\`/\`op\`/\`path\`
  change blocks, "return only the changed parts", Hard Rules 1, 8 and 10, section 6).
  Here you **edit the files directly**: \`template\` = \`template.json\`,
  \`dataResolver\` = \`dataResolver.json\`, \`script\` = \`script.js\`,
  \`serverScript\` = \`serverScript.js\`, \`style\` = \`style.css\`.
- Tools mentioned there (\`getDocumentation\`, \`describeCollection\`,
  \`validateComponent\`, \`queryData\`) are not available. "Load the documentation"
  means: read the file in \`${AI_GUIDE_DOCS_FOLDER}/\`. Collections and generic types that a
  dataResolver uses must already exist on the website - keep the ones that are
  used, do not invent new ones; ask the user when a new data source is needed.
- Everything about the parts themselves (syntax, expressions, \`$for\`, escaping,
  data shapes, Util helpers) applies 1:1.

## Rules for editing

1. \`template.json\`, \`dataResolver.json\`, \`page.json\` and \`resources.json\` must stay
   valid JSON (\`JSON.parse\`): no comments, no trailing commas. Check after every edit.
2. Keep the \`slug\` in \`page.json\` - it is how the import finds the page. Changing
   it creates a NEW page on import. \`_id\`, \`modifiedAt\` and \`createdBy\` are
   informational; leave them as they are.
3. A new page = a new folder with a \`page.json\` that has a unique \`slug\` (copy an
   existing \`page.json\` and remove \`_id\`). The folder name does not matter.
4. Do not delete a file to empty a field: a missing file leaves the field unchanged
   on import, an **empty** file clears it.
5. \`style.css\` and \`template.json\` are evaluated with \`\${...}\` expressions: a
   literal \`\${\` or a backtick in them has a meaning - see the specification.
6. Lines like \`//!#Name\` in \`script.js\`, \`serverScript.js\` and \`style.css\` mark
   editor tabs; keep them.
7. Pages often reference each other by slug (\`"t": "Cms"\` with \`slug\`) and media
   by id - these are not in the export; do not change such references blindly.
8. Change only what the task needs and keep the existing code style.

## Import

Zip the edited folders (the structure may sit inside one top folder) and import
the ZIP in the Lunuc admin. Only page folders and their known files are read;
this guide and \`${AI_GUIDE_DOCS_FOLDER}/\` are ignored. The import reports which pages were
created, updated or left unchanged.
`

const CLAUDE_MD = `# Claude Code

@AGENTS.md
`

/**
 * @returns [{path, content}] - AGENTS.md, CLAUDE.md and the reference documents that exist
 */
export const buildAiGuideFiles = () => {
    const files = []
    const docs = []
    const dir = docsDir()
    for (const doc of AI_GUIDE_DOCS) {
        try {
            const content = fs.readFileSync(path.join(dir, doc.file), 'utf8')
            files.push({path: AI_GUIDE_DOCS_FOLDER + '/' + doc.file, content})
            docs.push(doc)
        } catch (e) {
            // not installed on this server - the guide just does not list it
        }
    }
    files.unshift({path: 'AGENTS.md', content: agentsMd(docs)}, {path: 'CLAUDE.md', content: CLAUDE_MD})
    return files
}
