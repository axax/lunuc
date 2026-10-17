/**
 * With a genericType the typeLoaded hook in server.mjs removes `definition` from every
 * entry (unless removeDefinition: false) - it returns the definition once as
 * result.meta instead. Loading the whole definition per entry is then wasted:
 * on the pokerhelden player page 193 copies of the 7 KB definition were 1.4 MB
 * of a 3.8 MB result, carried through the pipeline only to be deleted.
 * So only its _id is resolved; the response stays the same. Nothing reads
 * item.definition before it is removed (postCheckResult, other typeLoaded hooks).
 * Changes the projection entry in place, as the builder uses this array.
 */
export const narrowDefinitionProjection = (data, otherOptions) => {
    if (!Array.isArray(data) || otherOptions?.removeDefinition === false) return
    for (let i = 0; i < data.length; i++) {
        const entry = data[i]
        if (entry === 'definition' ||
            (entry && entry.constructor === Object && Object.keys(entry).length === 1 && 'definition' in entry)) {
            data[i] = {definition: ['_id']}
        }
    }
}
