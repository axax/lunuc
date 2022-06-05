import path from 'path'
import Util from '../util/index.mjs'
import fs from 'fs'
import config from '../../gensrc/config.mjs'
import {execSync} from 'child_process'
import os from 'os'
import zipper from 'zip-local'
import {MONGO_URL} from '../database.mjs'
const {BACKUP_DIR, BACKUP_URL, UPLOAD_DIR, HOSTRULES_ABSPATH} = config

const ABS_UPLOAD_DIR = path.join(path.resolve(), UPLOAD_DIR)


export const getBackupDir = type=>{

    return path.join(path.resolve(), `${BACKUP_DIR}/${type}dumps/`)

}

export const listBackups = type =>{

    // make sure upload dir exists
    const backup_dir = getBackupDir(type)
    if (!Util.ensureDirectoryExistence(backup_dir)) {
        throw new Error(`Backup folder could not be created -> ${backup_dir}`)
    }

    const files = []
    fs.readdirSync(backup_dir).forEach(file => {
        if (file !== '.DS_Store') {
            const stats = fs.statSync(backup_dir + '/' + file)
            files.push({
                name: file,
                createdAt: (new Date(stats.mtime)).getTime(),
                size: (stats.size / 1000) + 'kb'
            })
        }
    })
    files.reverse()

    return files
}

export const createBackup = type =>{
    let result
    if(type==='db'){
        result = createDbBackup()
    }else if(type==='media'){
        result = createMediaBackup()
    }else if(type==='hostrule'){
        result = createHostruleBackup()
    }

    const stats = fs.statSync(result.fullName)

    return {name: result.name, createdAt: result.date, size: (stats.size / 1000) + 'kb'}
}

export const removeBackup = (type, name) => {

    const backup_dir = getBackupDir(type)

    fs.unlinkSync(backup_dir + name)

    return {status: 'ok'}
}

export const createDbBackup = ()=>{
    // make sure upload dir exists
    const backup_dir = getBackupDir('db')
    if (!Util.ensureDirectoryExistence(backup_dir)) {
        throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
    }

    /*
     Backup: mongodump --uri $LUNUC_MONGO_URL -v --archive=backup.25022018.gz --gzip
     */
    const date = Date.now(),
        name = 'backup.db.' + date + '.gz',
        fullName = path.join(backup_dir, name)

    const response = execSync(`mongodump --uri ${MONGO_URL} -v --archive="${fullName}" --gzip`)
    console.log('createDbDump', response)
    return {fullName, name, date}

}


export const mongoExport = ({type, query}) => {
    const fileName = `${type}-${new Date().getTime()}.json`
    const response = execSync(`mongoexport --uri "${MONGO_URL}" -c ${type} -q '${query}' -o "${getBackupDir('export')}/${fileName}"`)
    return BACKUP_URL+'/exportdumps/'+fileName
}

export const createMediaBackup = (filesToBackup)=>{
    // make sure upload dir exists
    const backup_dir = getBackupDir('media')
    if (!Util.ensureDirectoryExistence(backup_dir)) {
        throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
    }

    const date = Date.now(),
        name = 'backup.media.' + date + '.gz',
        fullName = path.join(backup_dir, name)


    const media_dir = ABS_UPLOAD_DIR

    const files = fs.readdirSync(media_dir)
    if (files.length === 0) {
        throw new Error(`No files in folder -> ${media_dir}`)
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunuc'))
    files.forEach((file) => {
        if (file.indexOf('@') === -1) {
            if (filesToBackup) {
                if (filesToBackup.indexOf(file) >= 0) {
                    fs.copyFileSync(media_dir + '/' + file, tmpDir + '/' + file)
                }
            } else {
                const stat = fs.lstatSync(media_dir + '/' + file)


                if (!stat.isDirectory() && stat.size < 2000000) {
                    // only include files small then 2MBs
                    fs.copyFileSync(media_dir + '/' + file, tmpDir + '/' + file)
                }
            }
        }
    })


    // zip media dir
    zipper.sync.zip(tmpDir).compress().save(fullName)

    //remove temp files
    const tempFiles = fs.readdirSync(tmpDir)
    tempFiles.forEach((file) => {
        fs.unlinkSync(path.join(tmpDir, file))
    })
    fs.rmdirSync(tmpDir)

    return {fullName, name, date}

}


export const createHostruleBackup = ()=>{
    // make sure upload dir exists
    const backup_dir = getBackupDir('hostrule')
    if (!Util.ensureDirectoryExistence(backup_dir)) {
        throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
    }

    const date = Date.now(),
        name = 'backup.hostrule.' + date + '.gz',
        fullName = path.join(backup_dir, name)


    // zip media dir
    zipper.sync.zip(HOSTRULES_ABSPATH).compress().save(fullName)

    return {fullName, name, date}

}
