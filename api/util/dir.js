import fs from 'fs'

export const rmDir = (dirPath, keepDir, options = {})=> {
    try { var files = fs.readdirSync(dirPath) }
    catch(e) { return }
    if (files.length > 0)
        for (var i = 0; i < files.length; i++) {
            const filePath = dirPath + '/' + files[i]
            if(options.log) {
                console.log('remove file '+filePath)
            }
            if (fs.statSync(filePath).isFile())
                fs.unlinkSync(filePath)
            else
                rmDir(filePath)
        }
    if(!keepDir)
        fs.rmdirSync(dirPath)
}
