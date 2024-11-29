'use strict';

let EventEmitter = require('events').EventEmitter;

// Expects that the folder listing is a Map

class MemoryNotifier extends EventEmitter {
    constructor(options) {
        super()

        let logfunc = (...args) => {
            let level = args.shift() || 'DEBUG';
            let message = args.shift() || '';

            console.log([level].concat(message || '').join(' '), ...args); // eslint-disable-line no-console
        };

        this.logger = options.logger || {
            info: logfunc.bind(null, 'INFO'),
            debug: logfunc.bind(null, 'DEBUG'),
            error: logfunc.bind(null, 'ERROR')
        };

        this._listeners = new EventEmitter();
        this._listeners.setMaxListeners(0);

        this._sessionFolders = {}

        EventEmitter.call(this);
    }

    /**
     * Registers an event handler for mailbox:username events
     *
     * @param {String} username
     * @param {String} mailbox
     * @param {Function} handler Function to run once there are new entries in the journal
     */
    addListener(session, handler) {
        this._listeners.addListener(session.user.id.toString(), handler);
    }

    /**
     * Unregisters an event handler for mailbox:username events
     *
     * @param {String} username
     * @param {String} mailbox
     * @param {Function} handler Function to run once there are new entries in the journal
     */
    removeListener(session, handler) {
        //console.log('removeListener',this._sessionFolders, session.id)
        Object.keys(this._sessionFolders).forEach(key=>{
            const sessionFolder = this._sessionFolders[key]
            if(sessionFolder.sessionId===session.id){
                delete this._sessionFolders[key];
            }
        })
        this._listeners.removeListener(session.user.id.toString(), handler);
    }

    addEntries(session, folder, entries, callback) {
        if (!folder) {
            return callback(null, new Error('Selected mailbox does not exist'));
        }

        if (entries && !Array.isArray(entries)) {
            entries = [entries]
        } else if (!entries || !entries.length) {
            return callback(null, false)
        }

        const folderId = folder._id.toString()
        if(!this._sessionFolders[folderId]) {
            this._sessionFolders[folderId] = {sessionId:session.id,journal: [], ...folder}
        }

        // store entires in the folder object
        entries.forEach(entry => {
            entry.modseq = ++folder.modifyIndex
            this._sessionFolders[folderId].journal.push(entry)
        });

        setImmediate(callback)
    }

    /**
     * Sends a notification that there are new updates in the selected mailbox
     *
     * @param {String} username
     * @param {Object} payload
     */
    fire(username, payload) {
        setImmediate(() => {
            this._listeners.emit(username, payload)
        })
    }


    getUpdates(folderObjectId, modifyIndex, callback) {
        modifyIndex = Number(modifyIndex) || 0;

        if (!folderObjectId) {
            return callback(null, 'NONEXISTENT');
        }
        const folderId = folderObjectId.toString()
        const sessionFolder = this._sessionFolders[folderId] || {journal:[]}
        let minIndex = sessionFolder.journal.length

        for (let i = sessionFolder.journal.length - 1; i >= 0; i--) {
            if (sessionFolder.journal[i].modseq > modifyIndex) {
                minIndex = i;
            } else {
                break;
            }
        }

        return callback(null, sessionFolder.journal.slice(minIndex))
    }
}

module.exports = MemoryNotifier;