import fs from 'fs'

export const rmDir = (dirPath, keepDir)=> {
    try { var files = fs.readdirSync(dirPath) }
    catch(e) { return }
    if (files.length > 0)
        for (var i = 0; i < files.length; i++) {
            var filePath = dirPath + '/' + files[i]
            console.log('remove file '+filePath)
            if (fs.statSync(filePath).isFile())
                fs.unlinkSync(filePath)
            else
                rmDir(filePath)
        }
    if(!keepDir)
        fs.rmdirSync(dirPath)
}
