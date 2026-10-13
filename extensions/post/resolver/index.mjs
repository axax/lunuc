import Util from '../../../api/util/index.mjs'
import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import {withFilter} from 'graphql-subscriptions'
import {pubsub} from '../../../api/subscription.mjs'
import {ApiError} from '../../../api/error.mjs'

const LEXICAL_BLOCK_FIELDS = {
    h1: 'headerOne',
    h2: 'headerTwo',
    h3: 'headerThree',
    h4: 'headerFour',
    h5: 'headerFive',
    h6: 'headerSix',
    quote: 'blockquote',
    code: 'codeBlock',
    paragraph: 'unstyled'
}

// Lexical text format bitmask
const FORMAT_BOLD = 1, FORMAT_ITALIC = 2, FORMAT_UNDERLINE = 8, FORMAT_CODE = 16

/**
 * Erzeugt aus einem Lexical-JSON die Felder für den Volltextindex (gleiche Struktur wie bei draftjs)
 */
const lexicalToSearchFields = (body) => {
    let json
    try {
        json = body && body.constructor === String ? JSON.parse(body) : body
    } catch (e) {
        return {}
    }
    if (!json || !json.root) {
        return {}
    }
    const fields = {}
    const add = (key, text) => {
        text = (text || '').trim()
        if (text) {
            fields[key] = fields[key] ? fields[key] + ' ' + text : text
        }
    }
    const collectText = (node) => {
        if (node.type === 'text' || node.type === 'code-highlight') {
            const format = node.format || 0
            if (format & FORMAT_BOLD) add('styleBold', node.text)
            if (format & FORMAT_ITALIC) add('styleItalic', node.text)
            if (format & FORMAT_UNDERLINE) add('styleUnderline', node.text)
            if (format & FORMAT_CODE) add('styleCode', node.text)
            return node.text || ''
        }
        if (node.type === 'image') {
            return [node.altText, node.caption].filter(Boolean).join(' ')
        }
        if (node.type === 'linebreak') {
            return ' '
        }
        return (node.children || []).map(collectText).join(' ')
    }
    const walk = (node, listType) => {
        for (const child of (node.children || [])) {
            if (child.type === 'list') {
                walk(child, child.listType)
            } else if (child.type === 'listitem') {
                const nested = (child.children || []).filter(c => c.type === 'list')
                const inline = {...child, children: (child.children || []).filter(c => c.type !== 'list')}
                add(listType === 'number' ? 'orderedListItem' : 'unorderedListItem', collectText(inline))
                nested.forEach(n => walk({children: [n]}, n.listType))
            } else if (child.type === 'table' || child.type === 'tablerow' || child.type === 'tablecell') {
                walk(child, listType)
            } else {
                const key = child.type === 'heading' ? LEXICAL_BLOCK_FIELDS[child.tag] : LEXICAL_BLOCK_FIELDS[child.type]
                add(key || 'unstyled', collectText(child))
            }
        }
    }
    walk(json.root)
    return fields
}

const searchFieldsForBody = (body, editor) => {
    if (editor === 'lexical') {
        return lexicalToSearchFields(body)
    }
    return Util.draftjsRawToFields(body)
}


export default db => ({
    Query: {
        posts: async ({sort, limit, page, offset, filter, query}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            let finalSort = sort || '_id desc',
                match = {createdBy: new ObjectId(context.id)}

            if (query) {
                match.$or = [{title: {$regex: query, $options: 'i'}}, {$text: {$search: query}}]
                finalSort = {score: {$meta: 'textScore'}}
            }
            const posts = await GenericResolver.entities(db, context, 'Post', ['title', 'body', 'editor', 'modifiedAt', 'search', 'searchScore'], {
                match,
                page,
                limit,
                offset,
                filter,
                sort: finalSort
            })

            posts.results.forEach(post=>{
                if(!post.title){
                    post.title = 'no title set'
                }

            })

            return posts
        }
    },
    Mutation: {
        createPost: async ({title, body, editor}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const postCollection = db.collection('Post')

            const search = searchFieldsForBody(body, editor)
            const modifiedAt = Date.now()

            const insertResult = await postCollection.insertOne({
                title,
                body,
                editor,
                search,
                modifiedAt,
                createdBy: new ObjectId(context.id)
            })

            if (insertResult.insertedId) {
                return {
                    _id: insertResult.insertedId,
                    title,
                    body,
                    editor,
                    modifiedAt,
                    createdBy: {
                        _id: new ObjectId(context.id),
                        username: context.username
                    },
                    status: 'created'
                }
            }
        },
        updatePost: async ({_id, title, body, editor}, {context}) => {

            const userContext = await Util.userOrAnonymousContext(db,context)

            // TODO premission management
            if( _id !== '640c372b0cbdad6ff37fd400') {
                Util.checkIfUserIsLoggedIn(context)
            }

            const postCollection = db.collection('Post')

            const $set = {modifiedAt: Date.now()}

            if(title!==undefined){
                $set.title = title
            }

            if(body!==undefined){
                $set.body = body
            }
            if(editor!==undefined){
                $set.editor = editor
            }
            if (body !== undefined) {
                let finalEditor = editor
                if (finalEditor === undefined) {
                    const existing = await postCollection.findOne({_id: new ObjectId(_id)}, {projection: {editor: 1}})
                    finalEditor = existing && existing.editor
                }
                $set.search = searchFieldsForBody(body, finalEditor)
            }

            const result = await postCollection.findOneAndUpdate({_id: new ObjectId(_id)}, {
                $set
            }, {returnDocument: 'after', includeResultMetadata: true})
            if (result.ok !== 1 || !result.value) {
                throw new ApiError('Post could not be changed')
            }else {


                await pubsub.publish('subscribePost', {
                    userId: userContext.id,
                    session: context.session,
                    clientId: context.clientId,
                    subscribePost: {action: 'update', data: [{_id, body, editor, title}]}
                })

            }
            // gespeicherte Werte zurückgeben: Felder, die nicht mitgeschickt wurden (z.B. title), dürfen nicht null sein
            const doc = result.value
            return {
                _id,
                title: doc.title || 'no title set',
                body: doc.body,
                editor: doc.editor,
                modifiedAt: doc.modifiedAt || $set.modifiedAt,
                createdBy: {
                    _id: new ObjectId(userContext.id),
                    username: userContext.username
                },
                status: 'updated'
            }
        },
        deletePost: async ({_id}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const postCollection = db.collection('Post')

            if (!_id) {
                throw new Error('Id is missing')
            }

            const deletedResult = await postCollection.deleteOne({
                _id: new ObjectId(_id)
            })

            if (deletedResult.deletedCount) {
                return {
                    _id: _id,
                    status: 'deleted'
                }
            } else {
                return {
                    _id: _id,
                    status: 'error'
                }
            }
        }
    },
    Subscription:{
        subscribePost: withFilter(() => pubsub.asyncIterableIterator('subscribePost'),
            (payload, context) => {
                if( payload && payload.clientId !== context.clientId) {
                    //return payload.userId === context.id
                    return true
                }
            }
        )
    }
})
