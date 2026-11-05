/*
 * Interactive shell sessions for the console page (CmsPage system/console).
 *
 * The login shell of the lunuc user (zsh or bash, with its own startup files) runs in a real pseudo
 * terminal without a native npm dependency: util-linux `script` (Linux) or a few lines of python
 * (macOS) allocate the pty. So line editing, tab completion, history, job control, colors and full
 * screen programs (vim, top, less) work like in a native terminal. The terminal size is set with
 * `stty` on the pty slave, the kernel then sends SIGWINCH. Without a pty bash runs on pipes
 * ("pipe" mode, the client edits the line).
 *
 * Output goes through the subscription subscribeRun ({event: 'data' | 'close' | 'error'}).
 * The last output is kept so a reloaded page can reattach to its running shell.
 *
 * `lu <command>` inside the shell asks the api process itself (memusage, clearcache, ...): the
 * shell function prints an OSC sequence, the server strips it from the output, runs the command
 * and writes the base64 encoded answer back to the waiting `read`.
 */
import {spawn, execFile} from 'child_process'
import {StringDecoder} from 'string_decoder'
import fs from 'fs'
import os from 'os'
import path from 'path'

const IS_MAC = process.platform === 'darwin'
const REPLAY_BUFFER_SIZE = 200 * 1024
const MAX_PENDING_OUTPUT = 2 * 1024 * 1024
const FLUSH_INTERVAL = 15
const IDLE_TIMEOUT = 12 * 60 * 60 * 1000
const LU_OSC_START = '\x1b]7701;'
const LU_OSC_END = '\x07'

const sessions = {}

/*
 * How the pty is created, tried in this order (a backend whose process ends right away is skipped
 * from then on): util-linux `script` (Linux), a few lines of python (macOS: BSD `script` refuses the
 * socket node uses as stdin), plain pipes without pty.
 */
const PY_PTY = `import os, pty, select, sys
pid, fd = pty.fork()
if pid == 0:
    os.execv('/bin/sh', ['/bin/sh', '-c', sys.argv[1]])
def write_all(f, d):
    while d:
        d = d[os.write(f, d):]
while True:
    try:
        r, _, _ = select.select([0, fd], [], [])
    except InterruptedError:
        continue
    if fd in r:
        try:
            d = os.read(fd, 65536)
        except OSError:
            break
        if not d:
            break
        write_all(1, d)
    if 0 in r:
        d = os.read(0, 65536)
        if not d:
            break
        write_all(fd, d)
_, st = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(st) if hasattr(os, 'waitstatus_to_exitcode') else 0)
`
const findExecutable = names => {
    for (const name of names) {
        for (const dir of (process.env.PATH || '').split(':').concat(['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin'])) {
            if (dir && fs.existsSync(path.join(dir, name))) return path.join(dir, name)
        }
    }
    return null
}
const BACKENDS = IS_MAC ? ['python', 'pipe'] : ['script', 'python', 'pipe']
const failedBackends = new Set()
const backendAvailable = name =>
    !failedBackends.has(name) && (name === 'pipe' || !!findExecutable(name === 'script' ? ['script'] : ['python3']))
const nextBackend = () => BACKENDS.find(backendAvailable)

/* the login shell of the user lunuc runs as (zsh or bash), like a native terminal */
const getShell = () => {
    let shell
    try {
        shell = os.userInfo().shell
    } catch (e) {
    }
    shell = shell || process.env.SHELL
    if (!shell || !/\/(zsh|bash)$/.test(shell) || !fs.existsSync(shell)) {
        shell = IS_MAC && fs.existsSync('/bin/zsh') ? '/bin/zsh' : (findExecutable(['bash']) || '/bin/bash')
    }
    return {path: shell, kind: shell.endsWith('zsh') ? 'zsh' : 'bash'}
}

const clampSize = (v, def, max) => {
    v = parseInt(v)
    return v > 0 ? Math.min(v, max) : def
}

const LU_FUNCTIONS = `
export LUNUC_CONSOLE=1
lu() {
  if [ $# -eq 0 ]; then
    echo "usage: lu <command>   commands: memusage, clearcache, connectedclients"
    echo "shortcuts: luupdate, luupdaten, luapi, luclient"
    return 0
  fi
  local r
  printf '${LU_OSC_START.replace('\x1b', '\\033')}%s${LU_OSC_END.replace('\x07', '\\007')}' "$*"
  IFS= read -rs r
  printf '%s' "$r" | base64 --decode
  echo
}
luupdate() { sudo /opt/lunuc/shell/start.sh -r all; }
luupdaten() { sudo /opt/lunuc/shell/start.sh -r none; }
luclient() { journalctl -lf -u lunuc-client --since "1 minutes ago"; }
luapi() { journalctl -lf -u lunuc-api --since "1 minutes ago"; }
`

/*
 * startup files: the user's own files are loaded, then the lu functions are added
 * (bash: --rcfile, zsh: ZDOTDIR pointing to wrappers of the files in $HOME)
 */
let rcDir
const getRcDir = () => {
    if (!rcDir) {
        rcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunuc-console-'))
        process.on('exit', () => fs.rmSync(rcDir, {recursive: true, force: true}))
        const write = (name, content) => fs.writeFileSync(path.join(rcDir, name), content, {mode: 0o644})
        write('bashrc', `
if [ "$(uname)" = Darwin ] && [ -r /etc/profile ]; then . /etc/profile
elif [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc; fi
[ -f ~/.bashrc ] && . ~/.bashrc
# bash without own prompt: user@host dir $
[ "$PS1" = '\\s-\\v\\$ ' ] && PS1='\\u@\\h \\W \\$ '
${LU_FUNCTIONS}`)
        write('.zshenv', `LUNUC_ZDOTDIR=$ZDOTDIR
[[ -f $HOME/.zshenv ]] && source $HOME/.zshenv
ZDOTDIR=$LUNUC_ZDOTDIR
`)
        write('.zprofile', `[[ -f $HOME/.zprofile ]] && source $HOME/.zprofile
`)
        write('.zshrc', `HISTFILE=$HOME/.zsh_history
ZDOTDIR=$HOME
[[ -f $HOME/.zshrc ]] && source $HOME/.zshrc
${LU_FUNCTIONS}`)
    }
    return rcDir
}

const spawnShell = ({cols, rows, backend}) => {
    const shell = getShell()
    const env = {
        ...process.env, SHELL: shell.path, TERM: 'xterm-256color', COLORTERM: 'truecolor'
    }
    // the size comes from the pty (stty / resize). COLUMNS / LINES in the environment would stay at the
    // initial size: zsh would draw its PROMPT_SP marker (% or #) and programs would use the wrong width
    delete env.COLUMNS
    delete env.LINES
    // a native terminal does not see what npm / node add when they start lunuc
    // (npm_config_prefix e.g. breaks nvm, node_modules/.bin in PATH hides global tools)
    for (const key of Object.keys(env)) {
        if (/^(npm_|NODE_OPTIONS$|NODE_ENV$|INIT_CWD$|NODE$)/i.test(key)) delete env[key]
    }
    if (env.PATH) env.PATH = env.PATH.split(':').filter(p => !/node_modules[\\/]\.bin|node-gyp-bin/.test(p)).join(':')
    // services often run without locale: readline would treat umlauts as meta keys
    if (!env.LANG && !env.LC_ALL && !env.LC_CTYPE) env.LANG = IS_MAC ? 'en_US.UTF-8' : 'C.UTF-8'
    const options = {detached: true, env, cwd: os.homedir()}
    const rc = getRcDir()

    if (backend === 'pipe') {
        // no pty: bash without line editing (the client edits the line)
        return spawn(findExecutable(['bash']) || 'bash', ['--noediting', '--rcfile', path.join(rc, 'bashrc'), '-i'], options)
    }
    let start
    if (shell.kind === 'zsh') {
        env.ZDOTDIR = rc
        start = `exec ${shell.path} -l`
    } else {
        start = `exec ${shell.path} --rcfile ${path.join(rc, 'bashrc')} -i`
    }
    // the pty may start with the settings of the pipe (raw, no echo, no \n -> \r\n): `stty sane` first
    const cmd = `stty sane cols ${cols} rows ${rows} 2>/dev/null; ${start}`
    if (backend === 'python') {
        return spawn(findExecutable(['python3']), ['-c', PY_PTY, cmd], options)
    }
    env.SHELL = '/bin/sh' // `script -c` runs the command with $SHELL
    return spawn(findExecutable(['script']), ['-qfec', cmd, '/dev/null'], options)
}

const run = (cmd, args) => new Promise(resolve => {
    execFile(cmd, args, {timeout: 3000}, (err, stdout) => resolve(err ? '' : stdout.toString().trim()))
})

/* tty of the shell (direct child of the script / python process) */
const getTty = async session => {
    if (!session.tty) {
        const child = (await run('pgrep', ['-P', String(session.proc.pid)])).split('\n')[0]
        if (child) {
            const tty = await run('ps', ['-o', 'tty=', '-p', child])
            if (tty && tty !== '?' && tty !== '??') {
                session.tty = '/dev/' + tty
            }
        }
    }
    return session.tty
}

export const getPtySession = id => sessions[id]

export const killPtySession = id => {
    const session = sessions[id]
    if (session) {
        clearTimeout(session.idleTimer)
        clearTimeout(session.flushTimer)
        if (session.proc.exitCode === null) {
            try {
                process.kill(-session.proc.pid, 'SIGKILL')
            } catch (e) {
            }
        }
        delete sessions[id]
    }
}

/*
 * starts a shell or reattaches to a running one
 * publish(subscribeRunPayload) sends to the owner, luHandler(command) returns the answer of `lu`
 */
export const startPtySession = ({id, owner, cols, rows, publish, luHandler}) => {
    publish = publish || (() => {})
    cols = clampSize(cols, 80, 1000)
    rows = clampSize(rows, 24, 500)

    const existing = sessions[id]
    if (existing && existing.proc.exitCode === null) {
        // pending output goes to the previous client, everything after the replay to the new one
        flush(existing)
        existing.publish = publish
        touch(existing)
        resizePtySession(id, cols, rows)
        return {id, mode: existing.mode, replay: existing.replay}
    }

    const backend = nextBackend()
    const mode = backend === 'pipe' ? 'pipe' : 'pty'
    const session = {
        id, owner, mode, backend, publish, luHandler, cols, rows,
        startedAt: Date.now(),
        replay: '',
        pending: '',
        carry: '',
        decoder: new StringDecoder('utf8')
    }
    session.proc = spawnShell({cols, rows, backend})
    sessions[id] = session

    const onData = data => handleOutput(session, session.decoder.write(data))
    session.proc.stdout.on('data', onData)
    session.proc.stderr.on('data', onData)

    session.proc.on('error', error => {
        session.publish({event: 'error', error: error.message, id})
    })
    session.proc.on('close', code => {
        flush(session)
        if (sessions[id] === session) {
            // the pty backend did not start: use the next one (from now on)
            if (session.backend !== 'pipe' && Date.now() - session.startedAt < 1500 && !session.hadInput) {
                failedBackends.add(session.backend)
                console.warn(`console: pty backend ${session.backend} failed (exit code ${code}), trying ${nextBackend()}`)
                delete sessions[id]
                const next = nextBackend()
                // mode first, so the client handles the output of the new shell correctly
                session.publish({event: 'mode', response: next === 'pipe' ? 'pipe' : 'pty', id})
                startPtySession({id, owner, cols, rows, publish: session.publish, luHandler})
                return
            }
            clearTimeout(session.idleTimer)
            delete sessions[id]
        }
        session.publish({event: 'close', response: String(code === null ? '' : code), id})
    })
    touch(session)
    return {id, mode, replay: ''}
}

const touch = session => {
    clearTimeout(session.idleTimer)
    session.idleTimer = setTimeout(() => killPtySession(session.id), IDLE_TIMEOUT)
}

const handleOutput = (session, str) => {
    if (!str) return
    if (session.mode === 'pipe') {
        // without a terminal bash complains about job control at startup
        str = str.replace(/^bash: (cannot set terminal process group|no job control in this shell).*\n/gm, '')
    }
    str = session.carry + str
    session.carry = ''

    // `lu` requests
    let start
    while ((start = str.indexOf(LU_OSC_START)) >= 0) {
        const end = str.indexOf(LU_OSC_END, start)
        if (end < 0) {
            session.carry = str.substring(start)
            str = str.substring(0, start)
            break
        }
        const command = str.substring(start + LU_OSC_START.length, end).trim()
        str = str.substring(0, start) + str.substring(end + 1)
        answerLu(session, command)
    }
    // keep a possibly incomplete start of the sequence for the next chunk
    const esc = str.lastIndexOf('\x1b')
    if (esc >= 0 && esc > str.length - LU_OSC_START.length && LU_OSC_START.startsWith(str.substring(esc))) {
        session.carry = str.substring(esc) + session.carry
        str = str.substring(0, esc)
    }
    if (!str) return

    session.replay += str
    if (session.replay.length > REPLAY_BUFFER_SIZE) {
        const cut = session.replay.indexOf('\n', session.replay.length - REPLAY_BUFFER_SIZE)
        session.replay = session.replay.substring(cut > 0 ? cut + 1 : session.replay.length - REPLAY_BUFFER_SIZE)
    }

    session.pending += str
    if (session.pending.length > MAX_PENDING_OUTPUT) {
        session.pending = '\r\n\x1b[33m[console: output skipped]\x1b[0m\r\n' + session.pending.substring(session.pending.length - MAX_PENDING_OUTPUT / 2)
    }
    if (!session.flushTimer) {
        session.flushTimer = setTimeout(() => flush(session), FLUSH_INTERVAL)
    }
}

const flush = session => {
    clearTimeout(session.flushTimer)
    session.flushTimer = null
    if (session.pending) {
        const response = session.pending
        session.pending = ''
        session.publish({event: 'data', response, id: session.id})
    }
}

const answerLu = async (session, command) => {
    let answer
    try {
        answer = String(await session.luHandler(command))
    } catch (e) {
        answer = 'lu: ' + e.message
    }
    if (session.proc.exitCode === null) {
        session.proc.stdin.write(Buffer.from(answer).toString('base64') + '\n')
    }
}

export const writePtySession = (id, data) => {
    const session = sessions[id]
    if (!session || session.proc.exitCode !== null) {
        throw new Error('Console session is not running')
    }
    session.hadInput = true
    touch(session)
    session.proc.stdin.write(data)
}

export const resizePtySession = async (id, cols, rows) => {
    const session = sessions[id]
    if (!session || session.mode !== 'pty') return
    cols = clampSize(cols, session.cols, 1000)
    rows = clampSize(rows, session.rows, 500)
    if (cols === session.cols && rows === session.rows && session.sized) return
    session.cols = cols
    session.rows = rows
    session.sized = true
    const tty = await getTty(session)
    if (tty) {
        await run('stty', [IS_MAC ? '-f' : '-F', tty, 'cols', String(cols), 'rows', String(rows)])
    }
}
