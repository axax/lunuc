
export const base64encode = (arrayBuffer) => {
    if (!arrayBuffer || arrayBuffer.length == 0) {
        return undefined
    }
    return btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)))
}

export const arrayBufferToString = (arrayBuffer) => {
    return String.fromCharCode.apply(null, new Uint8Array(arrayBuffer))
}