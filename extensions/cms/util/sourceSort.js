import ReactDOM from 'react-dom'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'

/**
 * Moving data entries shown on a page (elements with $inlineEditor mode "source") up or down.
 *
 * Template:   "$inlineEditor": {"mode": "source", "source": {"type": "GenericData",
 *                 "genericType": "X", "resolverKey": "Items", "_id": "...", "sortable": true}}
 * Definition: "structure": {"sortField": "sort", "sortGroup": ["parent"], ...}
 *
 * sortField  number field that holds the position (can also be given in the source of the template)
 * sortGroup  fields that delimit a list: only entries with the same values are sorted together
 *            (e.g. the beiträge of one bericht and bereich)
 *
 * The entry swaps its place with the neighbour of the same group (in the order shown on the page), then the
 * entries of the group get the positions 10, 20, 30 ... Only the sortField of entries whose position changed
 * is saved (partial update), the resolved data of the page is updated so the new order shows right away.
 *
 * Templates can call _app_.JsonDom.moveSourceEntry(_id, -1 | 1) (e.g. from arrow buttons, edit mode only).
 */

const definitionCache = {}

const notify = message => _app_.dispatcher.addNotification({
    horizontal: 'right',
    autoHideDuration: 3500,
    closeButton: true,
    message
})

const parseStructure = s => {
    if (!s) return {}
    if (typeof s === 'string') {
        try {
            return JSON.parse(s)
        } catch (e) {
            return {}
        }
    }
    return s
}

export const loadSortInfo = (genericType) => {
    if (!definitionCache[genericType]) {
        definitionCache[genericType] = client.query({
            fetchPolicy: 'network-only',
            query: 'query genericDataDefinitions($filter:String,$limit:Int){genericDataDefinitions(filter:$filter,limit:$limit){results{_id name structure}}}',
            variables: {limit: 1, filter: `name=="${genericType}"`}
        }).then(({data}) => {
            const def = data?.genericDataDefinitions?.results?.find(d => d.name === genericType)
            if (!def) {
                delete definitionCache[genericType]
                throw new Error(`GenericDataDefinition ${genericType} not found`)
            }
            const structure = parseStructure(def.structure)
            return {
                definitionId: def._id,
                sortField: structure.sortField,
                sortGroup: [].concat(structure.sortGroup || [])
            }
        }).catch(e => {
            delete definitionCache[genericType]
            throw e
        })
    }
    return definitionCache[genericType]
}

const loadItems = async (ids) => {
    const {data} = await client.query({
        fetchPolicy: 'network-only',
        query: 'query genericDatas($filter:String,$limit:Int){genericDatas(filter:$filter,limit:$limit){results{_id data}}}',
        variables: {limit: ids.length, filter: ids.map(id => `_id==${id}`).join(' || ')}
    })
    const map = {}
    ;(data?.genericDatas?.results || []).forEach(r => {
        let d = r.data
        if (typeof d === 'string') {
            try {
                d = JSON.parse(d)
            } catch (e) {
                d = {}
            }
        }
        map[r._id] = d || {}
    })
    return map
}

// a reference can be an id, an object with _id or an array of them
const normRef = v => {
    if (Array.isArray(v)) v = v[0]
    if (v && typeof v === 'object') v = v._id
    return v === undefined || v === null ? '' : String(v)
}

const sourceOf = helper => {
    const options = helper.props._options
    if (!options || options.mode !== 'source' || !options.source) return null
    const source = helper.parseDataSource(options.source)
    if (!source || !source.sortable || !source._id || source.type !== 'GenericData' || !source.genericType) return null
    return source
}

export const isSourceSortable = helper => !!sourceOf(helper)

const domOrder = (a, b) => (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1

const updateResolvedData = (jsonDom, resolverKey, changes, sortField, seen = new Set()) => {
    if (!jsonDom || seen.has(jsonDom)) return
    seen.add(jsonDom)
    try {
        if (jsonDom.props && jsonDom.props.resolvedData && jsonDom.props.updateResolvedData) {
            const json = JSON.parse(jsonDom.props.resolvedData)
            const results = json[resolverKey] && json[resolverKey].results
            if (results) {
                let changed = false
                results.forEach(r => {
                    if (changes[r._id] !== undefined) {
                        if (typeof r.data === 'string') {
                            const d = JSON.parse(r.data)
                            d[sortField] = changes[r._id]
                            r.data = JSON.stringify(d)
                        } else {
                            r.data = {...(r.data || {}), [sortField]: changes[r._id]}
                        }
                        changed = true
                    }
                })
                if (changed) {
                    jsonDom.props.updateResolvedData({json})
                }
            }
        }
    } catch (e) {
        console.warn('sourceSort: update of the resolved data failed', e)
    }
    Object.keys(jsonDom.componentRefs || {}).forEach(key => {
        updateResolvedData(jsonDom.componentRefs[key].comp, resolverKey, changes, sortField, seen)
    })
}

let HelperClass = null, busy = false

const findHelper = _id => Object.values(HelperClass ? HelperClass.instances : {}).find(inst => {
    const s = sourceOf(inst)
    return s && s._id === _id
})

/**
 * the visible entries of the same group as the helper in the order shown on the page
 */
const groupOf = async (helper, source) => {
    const seenIds = {}
    const candidates = []
    Object.values(HelperClass.instances || {}).forEach(inst => {
        const s = sourceOf(inst)
        if (!s || s.genericType !== source.genericType || seenIds[s._id]) return
        const n = ReactDOM.findDOMNode(inst)
        if (!n || !document.body.contains(n)) return
        seenIds[s._id] = true
        candidates.push({id: s._id, node: n, inst})
    })
    const info = await loadSortInfo(source.genericType)
    const sortField = source.sortField || info.sortField
    if (!sortField) {
        throw new Error(_t('JsonDomHelper.sort.noSortField', {type: source.genericType}))
    }
    const data = await loadItems(candidates.map(c => c.id))
    const groupKey = id => info.sortGroup.map(f => normRef(data[id] && data[id][f])).join('|')
    const myGroup = groupKey(source._id)
    const items = candidates.filter(c => data[c.id] && groupKey(c.id) === myGroup).map(c => ({
        ...c,
        sort: parseFloat(data[c.id][sortField])
    }))
    items.sort(domOrder)
    return {items, info: {...info, sortField}}
}

/**
 * moves the entry of the helper (or with the given id) by dir (-1 up, 1 down)
 */
export const moveSourceEntry = async (helperOrId, dir) => {
    const helper = typeof helperOrId === 'string' ? findHelper(helperOrId) : helperOrId
    const source = helper && sourceOf(helper)
    if (!source || busy) return
    busy = true
    try {
        const {items, info} = await groupOf(helper, source)
        const idx = items.findIndex(it => it.id === source._id)
        const to = idx + (dir < 0 ? -1 : 1)
        if (idx < 0 || to < 0 || to >= items.length) {
            return
        }
        const order = items.slice()
        order.splice(idx, 1)
        order.splice(to, 0, items[idx])
        const changes = {}
        order.forEach((it, i) => {
            const pos = (i + 1) * 10
            if (it.sort !== pos) {
                changes[it.id] = pos
            }
        })
        const ids = Object.keys(changes)
        if (ids.length === 0) return

        await Promise.all(ids.map(_id => client.mutate({
            mutation: 'mutation updateGenericData($_id:ID!,$data:String,$definition:ID,$_meta:String){updateGenericData(_id:$_id,data:$data,definition:$definition,_meta:$_meta){_id status}}',
            variables: {
                _id,
                definition: info.definitionId,
                data: JSON.stringify({[info.sortField]: changes[_id]}),
                _meta: JSON.stringify({partialUpdate: true})
            }
        })))

        // show the new order right away
        const root = helper.props._this && helper.props._this.scope && helper.props._this.scope.root
        updateResolvedData(root || helper.props._this, source.resolverKey || source.genericType, changes, info.sortField)

        // keep the moved entry in view (top of the entry, use scroll-margin-top in the css for a fixed header)
        setTimeout(() => {
            const moved = findHelper(source._id)
            const node = moved && ReactDOM.findDOMNode(moved)
            if (node && node.scrollIntoView) {
                node.scrollIntoView({block: 'start', behavior: 'smooth'})
            }
        }, 50)
        notify(_t('JsonDomHelper.sort.saved'))
    } catch (e) {
        console.error(e)
        notify(_t('JsonDomHelper.sort.error', {message: e.message}))
    } finally {
        busy = false
    }
}

/**
 * called once by JsonDomHelper (only loaded in edit mode)
 */
export const registerSourceSort = (JsonDomHelper) => {
    HelperClass = JsonDomHelper
    if (typeof _app_ !== 'undefined') {
        if (!_app_.JsonDom) _app_.JsonDom = {}
        _app_.JsonDom.moveSourceEntry = moveSourceEntry
    }
}
