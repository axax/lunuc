import crypto from 'crypto'

export const createSimpleEtag = ({content, stats})=>{
    const hash = crypto.createHash('md5').update(content).digest('hex')
    return hash + (stats?stats.mtime.getTime().toString(16):'')
}