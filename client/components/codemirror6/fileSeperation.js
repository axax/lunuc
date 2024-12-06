import styled from '@emotion/styled'

export const StyledFile = styled('a')(({ active }) => ({
    display: 'inline-block',
    padding: '0.5rem',
    background: '#efefef',
    borderRadius: '0.1rem',
    cursor: 'pointer',
    '&:hover': {
        background: '#aaa'
    },
    ...(active && {
        background: '#aaa'
    })
}))

export function seperateFiles(value){
    const fileContents = value.split('\n//!#')
    const files = []
    if (fileContents.length > 1) {
        fileContents.forEach((file, i) => {
            let filename = 'main'
            if (i === 0) {
                if (value.indexOf('//!#') === 0) {
                    fileContents[i] = fileContents[i].substring(fileContents[i].indexOf('\n') + 1)
                    filename = getFirstLine(value).substring(4)
                }
            } else {
                fileContents[i] = fileContents[i].substring(fileContents[i].indexOf('\n') + 1)
                filename = getFirstLine(file)
            }
            files.push({filename,content:fileContents[i]})
        })
    }
    return files
}


export function putFilesTogether(files, finalFileIndex, codeAsString) {
    let fullCodeAsString
    if (files) {
        fullCodeAsString = ''
        files.forEach((file, i) => {
            fullCodeAsString += '//!#' + file.filename + '\n'
            if (i !== finalFileIndex) {
                fullCodeAsString += file.content.trim() + '\n'
            } else {
                fullCodeAsString += codeAsString + '\n'
            }
        })
    } else {
        fullCodeAsString = codeAsString
    }
    return fullCodeAsString
}


function getFirstLine(text) {
    let index = text.indexOf('\n')
    if (index === -1) index = undefined
    return text.substring(0, index)
}