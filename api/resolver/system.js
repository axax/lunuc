import Util from '../util'
import {execSync} from 'child_process'
import path from 'path'
import fs from 'fs'
import config from 'gen/config'
import zipper from 'zip-local'

const {BACKUP_DIR,UPLOAD_DIR} = config

export const systemResolver = (db) => ({
    run: async ({command}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        if (!command) {
            throw new Error('No command to execute.')
        }

        const options = {
            encoding: 'utf8'
        }

        const response = execSync(command, options)

        return {response}
    },
    brokenReferences: async ({command}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        throw new Error('Not implmented yet.')
    },
    dbDumps: async (data, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        // make sure upload dir exists
        const backup_dir = path.join(__dirname, '../../'+ BACKUP_DIR+'/dbdumps/')
        if( !Util.ensureDirectoryExistence(backup_dir) ){
            throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
        }

        const files = []
        fs.readdirSync(backup_dir).forEach(file => {
            if( file !== '.DS_Store') {
                const stats = fs.statSync(backup_dir + '/' + file)
                files.push({name: file, createdAt: new Date(stats.mtime), size: (stats.size / 1000) + 'kb'})
            }
        })

        files.reverse()

        const response = {
            results: files,
            offset: 0,
            limit: 0,
            total: files.length
        }

        return response
    },
    createDbDump: async ({type}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        // make sure upload dir exists
        const backup_dir = path.join(__dirname, '../../'+ BACKUP_DIR+'/dbdumps/')
        if( !Util.ensureDirectoryExistence(backup_dir) ){
            throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
        }

        /*

         Backup: mongodump --uri $LUNUC_MONGO_URL -v --archive=backup.25022018.gz --gzip

         */
        const date = Date.now(),
            name='backup.db.'+date+'.gz',
            fullName = path.join(backup_dir, name)

        const response = execSync('mongodump --uri $LUNUC_MONGO_URL -v --archive="'+fullName+'" --gzip')
        console.log('createDbDump',response)

        const stats = fs.statSync(fullName)

        return {name, createdAt: date, size: (stats.size / 1000) + 'kb'}
    },
    mediaDumps: async (data, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        // make sure upload dir exists
        const backup_dir = path.join(__dirname, '../../'+ BACKUP_DIR+'/mediadumps/')
        if( !Util.ensureDirectoryExistence(backup_dir) ){
            throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
        }

        const files = []
        fs.readdirSync(backup_dir).forEach(file => {
            if( file !== '.DS_Store') {
                const stats = fs.statSync(backup_dir + '/' + file)
                files.push({name: file, createdAt: new Date(stats.mtime), size: (stats.size / 1000) + 'kb'})
            }
        })
        files.reverse()
        const response = {
            results: files,
            offset: 0,
            limit: 0,
            total: files.length
        }

        return response
    },
    createMediaDump: async ({type}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        // make sure upload dir exists
        const backup_dir = path.join(__dirname, '../../'+ BACKUP_DIR+'/mediadumps/')
        if( !Util.ensureDirectoryExistence(backup_dir) ){
            throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
        }

        const date = Date.now(),
            name='backup.media.'+date+'.gz',
            fullName = path.join(backup_dir, name)


        const media_dir = path.join(__dirname, '../../'+ UPLOAD_DIR)

        const files = fs.readdirSync(media_dir);
        if( files.length === 0){
            throw new Error(`No files in folder -> ${media_dir}`)
        }

        // zip media dir
        zipper.sync.zip(media_dir).compress().save(fullName);


        const stats = fs.statSync(fullName)

        return {name, createdAt: date, size: (stats.size / 1000) + 'kb'}
    }
})