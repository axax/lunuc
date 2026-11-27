import {spawn, execFileSync} from 'child_process'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'

/*
 Browser host: keeps a real Google Chrome with remote debugging running on this machine, so that another
 lunuc server can use it with LUNUC_BROWSER_REMOTE (util/stealthBrowser.mjs) - e.g. a Mac at home with a
 residential IP for a VPS whose datacenter IP is blocked by bot checks.

   env LUNUC_BROWSER_HOST=9222                 debugging port. Chrome listens on 127.0.0.1 only; make it
                                               reachable in the tailnet with
                                               tailscale serve --bg --tcp 9223 tcp://localhost:9222
   env LUNUC_BROWSER_HOST_PROFILE=<dir>        profile directory (default ~/lunuc-chrome)
   env LUNUC_BROWSER_HOST_HEADLESS=true        without windows (default: with windows, passes bot checks better)
   env LUNUC_BROWSER_HOST_EXECUTABLE=<path>    Chrome binary (default: installed Google Chrome)

 Chrome runs as its own process (detached) and is NOT controlled by this lunuc: a permanent puppeteer
 connection is detected by bot checks (Cloudflare challenge on every page). It keeps running when lunuc
 stops or restarts. A watchdog checks the port every WATCH_INTERVAL_MS and starts Chrome again when it
 does not answer (crash, quit).
 Don't use this profile for own logins: whoever reaches the port controls the browser.
 */

const WATCH_INTERVAL_MS = 30 * 1000
const START_GRACE_MS = 20 * 1000   // a just started Chrome needs some seconds until the port answers

const state = () => {
    const a = global._app_ || (global._app_ = {})
    return a._browserHost || (a._browserHost = {})
}

const isFile = (file) => {
    try {
        return fs.statSync(file).isFile()
    } catch (e) {
        return false
    }
}

export const findChromeExecutable = async () => {
    if (process.env.LUNUC_BROWSER_HOST_EXECUTABLE) {
        return process.env.LUNUC_BROWSER_HOST_EXECUTABLE
    }
    const candidates = []
    if (process.platform === 'darwin') {
        const binary = 'Contents/MacOS/Google Chrome'
        candidates.push(path.join('/Applications/Google Chrome.app', binary),
            path.join(os.homedir(), 'Applications/Google Chrome.app', binary))
        try {
            // installed somewhere else: ask spotlight
            const app = execFileSync('mdfind', ["kMDItemCFBundleIdentifier == 'com.google.Chrome'"],
                {encoding: 'utf8', timeout: 5000}).split('\n').find(Boolean)
            if (app) candidates.push(path.join(app, binary))
        } catch (e) {}
    } else if (process.platform === 'win32') {
        candidates.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')
    } else {
        candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser')
    }
    const found = candidates.find(isFile)
    if (found) {
        return found
    }
    // fallback: Chrome for Testing of puppeteer (works, but a real Chrome is better for bot checks)
    try {
        const {default: puppeteer} = await import('puppeteer')
        const file = puppeteer.executablePath()
        if (isFile(file)) {
            console.log(`browser host: Google Chrome not found, using ${file}`)
            return file
        }
    } catch (e) {}
    return null
}

// true if a Chrome answers on the debugging port
export const isDebugPortOpen = (port, timeout = 3000) => new Promise(resolve => {
    const req = http.get({host: '127.0.0.1', port, path: '/json/version', timeout}, res => {
        res.resume()
        resolve(res.statusCode === 200)
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(false))
})

const launchChrome = async (port) => {
    const s = state()
    const executable = await findChromeExecutable()
    if (!executable) {
        s.lastError = 'Google Chrome not found (set LUNUC_BROWSER_HOST_EXECUTABLE)'
        console.log(`browser host: ${s.lastError}`)
        return
    }
    const profile = process.env.LUNUC_BROWSER_HOST_PROFILE || path.join(os.homedir(), 'lunuc-chrome')
    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        '--lang=de-CH',
        '--no-first-run',
        '--no-default-browser-check',
        // windows in the background or covered keep rendering (live view of browser-simulator)
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling'
    ]
    if (process.env.LUNUC_BROWSER_HOST_HEADLESS === 'true') {
        args.push('--headless=new', '--window-size=1280,800')
    }
    try {
        const child = spawn(executable, args, {detached: true, stdio: 'ignore'})
        child.on('error', e => {
            s.lastError = e.message
            console.log(`browser host: start failed: ${e.message}`)
        })
        child.unref()
        Object.assign(s, {pid: child.pid, executable, profile, lastStart: Date.now(), lastError: null})
        console.log(`browser host: started Chrome (pid ${child.pid}) on port ${port}, profile ${profile}`)
    } catch (e) {
        s.lastError = e.message
        console.log(`browser host: start failed: ${e.message}`)
    }
}

const check = async (port) => {
    const s = state()
    if (s.checking) return
    s.checking = true
    try {
        s.running = await isDebugPortOpen(port)
        if (!s.running && !(s.lastStart && Date.now() - s.lastStart < START_GRACE_MS)) {
            await launchChrome(port)
        }
    } catch (e) {
        console.log(`browser host: check failed: ${e.message}`)
    } finally {
        s.checking = false
    }
}

// called once at the start of the api; does nothing without LUNUC_BROWSER_HOST
export const startBrowserHost = () => {
    const port = parseInt(process.env.LUNUC_BROWSER_HOST)
    if (!port) return
    const s = state()
    if (s.timer) return
    s.port = port
    check(port)
    s.timer = setInterval(() => check(port), WATCH_INTERVAL_MS)
    s.timer.unref?.()
}

// for status displays
export const getBrowserHostStatus = () => {
    const {port, running, pid, executable, profile, lastStart, lastError} = state()
    return port ? {port, running: !!running, pid, executable, profile, lastStart, lastError} : null
}
