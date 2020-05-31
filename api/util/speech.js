import {execSync} from 'child_process'
import config from 'gen/config'
const {UPLOAD_DIR} = config
import path from 'path'
import Util from "./index";

/*
 A very basic implementation to convert text to speech
 */

export const text2speech = (text, lang='en', filename = Date.now()+'.wav' ) => {
    const filepath = path.join(__dirname, '../../' + UPLOAD_DIR+'/speech/')
    if (Util.ensureDirectoryExistence(filepath)) {

        //brew install espeak
        execSync(`espeak "${text.replace(/"/g, '')}" -v${lang}+m1 -g5 -s150 -p50 -a100 -m --stdout > ${filepath}${filename}`, {encoding: 'utf8'})
    }
    return {filepath, filename}
}
