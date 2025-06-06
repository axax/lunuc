import React from 'react'
import JsonDom from '../components/JsonDom'
import Util from 'client/util/index.mjs'
import DomUtil from 'client/util/dom.mjs'
import {getSubscribeQuery} from 'util/types.mjs'
import {isEditMode, getSlugVersion, getCmsPageQuery} from '../util/cmsView.mjs'
import withCms from './withCms'
import {client} from '../../../client/middleware/graphql'
import Hook from '../../../util/hook.cjs'
import {deepMerge} from '../../../util/deepMerge.mjs'
import {CAPABILITY_MANAGE_CMS_CONTENT} from '../constants/index.mjs'
import {findObjectsByAttributeValue, isString, parseOrElse, setPropertyByPath} from '../../../client/util/json.mjs'

class CmsViewContainer extends React.Component {
    oriTitle = document.title
    subscriptions = {}

    constructor(props) {
        super(props)
        this.addResources(props)
    }

    shouldComponentUpdate(props) {
        const {cmsPage} = props
        const cmsPageOld = this.props.cmsPage
        if (cmsPage) {
            if (!cmsPageOld || (cmsPage.subscriptions !== cmsPageOld.subscriptions)) {
                this.setUpSubscriptions(props)
            }

            if (!cmsPageOld || cmsPage.resources !== cmsPageOld.resources) {
                this.addResources(props)
            }
        }

        if ((!cmsPage && props.loading) || props.aboutToChange || props?._parentRef?.props?.loading) {
            // if there is still no cmsPage and it is still loading
            // there is no need to update
            return false
        }
        // only update if it is needed
        return !cmsPage ||
            !cmsPageOld ||
            props.loading !== this.props.loading ||
            cmsPage.slug !== cmsPageOld.slug ||
            cmsPage.modifiedAt !== cmsPageOld.modifiedAt ||
            cmsPage.resolvedData !== cmsPageOld.resolvedData ||
            (
                cmsPage.urlSensitiv && props.location && /*cmsPage.urlSensitiv!=='false' &&*/ (
                    props.location.search !== this.props.location.search ||
                    props.location.hash !== this.props.location.hash)
            ) ||
            props.user !== this.props.user ||
            props.children != this.props.children ||
            Util.shallowCompare(props._props, this.props._props, {compareArray:true}) ||
            /* only if in edit mode */
            (isEditMode(props) && (
                cmsPage.template !== cmsPageOld.template ||
                cmsPage.script !== cmsPageOld.script ||
                cmsPage.style !== cmsPageOld.style ||
                props.cmsEditData !== this.props.cmsEditData ||
                /* because it is passed to the JsonDom */
                (props.settings && this.props.settings.inlineEditor !== props.settings.inlineEditor)))

    }

    componentDidMount() {
        this.setUpSubscriptions(this.props)
    }

    componentWillUnmount() {
        if (!this.props.dynamic) {
            document.title = this.oriTitle
        }
        this.removeSubscriptions()
    }

    render() {
        const {slug, cmsPage, children, dynamic, settings, setKeyValue, getKeyValue, updateResolvedData, _props, loaderClass, ...props} = this.props
        const editMode = isEditMode(this.props)
        if (!cmsPage) {
            // show a loader here
            if(loaderClass){
                return <div className={loaderClass}/>
            }

            return null
        } else {
            if(cmsPage.disableRendering){
                return <div>Rendering is disabled</div>
            }
            // set page title
            if (!dynamic && cmsPage.name)
                document.title = cmsPage.name[_app_.lang]
        }

        if (cmsPage.ssr && !editMode) {
            // it was already rendered on the server side
            return <span dangerouslySetInnerHTML={{__html: cmsPage.html}}/>
        }
        const startTime = new Date()

        const content = <JsonDom
            clientQuery={this.clientQuery.bind(this)}
            serverMethod={this.serverMethod.bind(this)}
            setKeyValue={setKeyValue}
            getKeyValue={getKeyValue}
            updateResolvedData={updateResolvedData}
            template={cmsPage.template}
            meta={cmsPage.meta}
            script={cmsPage.script}
            style={cmsPage.style}
            ssrStyle={cmsPage.ssrStyle}
            uniqueStyle={cmsPage.uniqueStyle}
            resolvedData={cmsPage.resolvedData}
            parseResolvedData={cmsPage.parseResolvedData}
            resources={cmsPage.resources}
            description={cmsPage.description}
            keywords={cmsPage.keyword}
            author={cmsPage.author}
            editMode={editMode}
            inlineEditor={(cmsPage.publicEdit || Util.hasCapability(_app_.user, CAPABILITY_MANAGE_CMS_CONTENT)) && settings && !!settings.inlineEditor}
            slug={cmsPage.realSlug}
            title={cmsPage.name}
            publicEdit={cmsPage.publicEdit}
            dynamic={dynamic}
            subscriptionCallback={cb => {
                this._subscriptionCallback = cb
            }}
            onFetchMore={({query, meta}, cb) => {
                if(this.props.fetchMore) {
                    this.props.fetchMore({
                        variables: {
                            query,
                            meta
                        },
                        updateQuery: (prev, data) => {
                            if(data) {
                                cb(data.fetchMoreResult)
                            }
                        }
                    })
                }
            }}
            _props={_props}
            {...props}>{children}</JsonDom>

        console.info(`render ${this.constructor.name} for ${slug} (loading=${this.props.loading}) in ${new Date() - startTime}ms / time since index.html loaded ${(new Date()).getTime() - _app_.start.getTime()}ms`)
        return content
    }


    addResources(props) {
        const {dynamic, cmsPage} = props

        if (cmsPage && (!dynamic || cmsPage.alwaysLoadAssets)) {
            const {resources} = cmsPage

            if( !dynamic) {
                DomUtil.removeElements('[data-cms-view]', null, document.head)
            }

            if (resources) {
                console.log('refresh resources', props.slug)

                try {
                    const resourceList = JSON.parse(Util.replacePlaceholders(resources,{_app_}))

                    const loadNext = (index) =>{
                        if( index>=resourceList.length){
                            return
                        }
                        let resource = resourceList[index], fileType, params, attrs

                        if(resource.constructor === Object){
                            attrs = resource
                            resource = resource.src
                            delete attrs.src
                        }else if (resource.startsWith('[')) {
                            params = resource.substring(1, resource.indexOf(']'))
                            resource = resource.substring(resource.indexOf(']') + 1)
                            fileType = params
                        }
                        if (!fileType) {
                            const temp = resource.split('?')[0]
                            fileType = temp.substring(temp.lastIndexOf('.') + 1)
                        }

                        /*if (!params) {
                            if (resource.indexOf('?') >= 0) {
                                resource += '&'
                            } else {
                                resource += '?'
                            }
                            resource += 'v=' + config.BUILD_NUMBER
                        }*/
                        const finalAttrs = {
                            data: {cmsView: true},
                            id: resource.replace(/[^A-Za-z0-9]/g, '-'),
                            ...attrs
                        }

                        if (fileType.startsWith('css')) {
                            DomUtil.addStyle(resource, finalAttrs)
                            loadNext(index+1)
                        } else if (fileType.startsWith('js')) {
                            if(finalAttrs.async === false){
                                finalAttrs.onload = ()=>{
                                    loadNext(index+1)
                                }
                            }else{
                                loadNext(index+1)
                            }
                            DomUtil.addScript(resource, finalAttrs)
                        }

                    }

                    loadNext(0)
                } catch (e) {
                    console.error('Error in resources', e)
                }
            }
        }
    }


    removeSubscriptions() {
        // remove all subscriptions
        Object.keys(this.subscriptions).forEach(key => {
            this.subscriptions[key].unsubscribe()
            delete this.subscriptions[key]
        })
    }


    setUpSubscriptions(props) {
        if (!props.cmsPage) return

        const {cmsPage: {subscriptions}} = props

        let subscriptionArray = parseOrElse(subscriptions, false)

        if(!subscriptionArray){
            return
        }

        // remove subscriptions
        this.removeSubscriptions()

        const _this = this

        // register new supscriptions
        subscriptionArray.forEach(subscription => {

            const subscriptionKey = subscription.key || subscription.name || subscription.type

            if(!subscriptionKey){
                return
            }

            if (!this.subscriptions[subscriptionKey]) {
                let subscriptionQuery = subscription.query,
                    subscriptionName = subscription.name,
                    subscriptionVariablesDefinition = '',
                    subscriptionVariables = ''

                if( subscription.type){

                    subscriptionName = `subscribe${subscription.type}`

                    if(!subscription.query) {

                        // create query based on type structure
                        subscriptionQuery = getSubscribeQuery(subscription.type)
                        if (!subscriptionQuery) {
                            console.error('Invalid type for subscription')
                            return
                        }
                    }
                }

                if(subscription.variables){
                    Object.keys(subscription.variables).forEach((key)=>{
                        subscriptionVariablesDefinition+='$'+key+': String'
                        subscriptionVariables+=key+':$'+key
                    })
                }


                if (!subscriptionQuery){
                    console.error('invalid query for subscription')
                    return
                }
                if (!subscriptionName){
                    console.error('invalid name for subscription')
                    return
                }

                const qqlSubscribe = `subscription ${subscriptionName}${subscriptionVariablesDefinition?'('+subscriptionVariablesDefinition+')':''}{${subscriptionName}${subscriptionVariables?'('+subscriptionVariables+')':''}{${subscriptionQuery}}}`


                console.log(`create subsciption ${subscriptionKey}`)
                this.subscriptions[subscriptionKey] = client.subscribe({
                    query: qqlSubscribe,
                    variables: subscription.variables
                }).subscribe({
                    next(supscriptionData) {
                        if (subscription.callback!==false) {
                            // callback to JsonDom Script
                            _this._subscriptionCallback(supscriptionData)
                        }
                        if (subscription.autoUpdate) {

                            if (!supscriptionData.data || !supscriptionData.data[subscriptionName]) {
                                //console.warn('subscription data missing')
                                return
                            }
                            const {action, _meta, filter, data, removedIds} = supscriptionData.data[subscriptionName]

                            if ((data || removedIds) && (!filter || !subscription.filter[action] || filter === subscription.filter[action])) {
                                const storedData = client.readQuery({
                                    query: getCmsPageQuery(_this.props),
                                    variables: _this.props.cmsPageVariables
                                })


                                // upadate data in resolvedData string
                                if (storedData && storedData.cmsPage && storedData.cmsPage.resolvedData) {
                                    const resolvedDataJson = JSON.parse(storedData.cmsPage.resolvedData)

                                    if(subscription.updateMap){
                                        data.forEach(dataEntry =>{
                                            subscription.updateMap.forEach(map=>{
                                                const fromValue = dataEntry[map.fromValueKey],
                                                    fromKey = dataEntry[map.fromKey],
                                                    toKey = Util.replacePlaceholders(map.toKey,{fromKey: fromKey.replaceAll('.','\\.')})
                                                setPropertyByPath(map.parse?JSON.parse(fromValue):fromValue,toKey, resolvedDataJson)
                                            })
                                        })
                                        _this.updateStoredData({subscription, storedData, resolvedDataJson})
                                    }else if (resolvedDataJson[subscription.autoUpdate] && resolvedDataJson[subscription.autoUpdate].results) {

                                        const refResults = resolvedDataJson[subscription.autoUpdate].results
                                        const finalData = action==='delete'?removedIds.map(f=>({_id:f})):data
                                        finalData.forEach(entry=>{
                                            // remove null values from new data
                                            const noNullData = Util.removeNullValues(entry)
                                            Object.keys(noNullData).map(k => {
                                                // check for localized values
                                                if (noNullData[k].constructor === Object && noNullData[k].__typename === 'LocalizedString') {
                                                    const v = noNullData[k][_app_.lang]
                                                    if (v) {
                                                        noNullData[k] = v
                                                    }
                                                }
                                            })
                                            if (['update', 'delete'].indexOf(action) >= 0) {

                                                const allData = findObjectsByAttributeValue(refResults, '_id', entry._id, {returnParent:true})
                                                const partialUpdate = parseOrElse(_meta,{}).partialUpdate
                                                allData.sort((a, b) => b.keyIndex - a.keyIndex).forEach(data=>{
                                                    if (action === 'update') {
                                                        if(partialUpdate){
                                                            // TODO partialUpdate
                                                            console.log( noNullData)
                                                            data.parent[data.keyIndex] = deepMerge({}, data.data, noNullData)
                                                        }else {
                                                            // update data
                                                            data.parent[data.keyIndex] = Object.assign({}, data.data, noNullData)
                                                        }
                                                    } else {
                                                        // delete data
                                                        if(Array.isArray(data.parent)) {
                                                            data.parent.splice(data.keyIndex, 1)
                                                        }else{
                                                            delete data.parent[data.keyIndex]
                                                        }
                                                    }
                                                })
                                                if(allData.length==0){
                                                    console.warn(`Data ${entry._id} does not exist.`)
                                                }

                                            } else {
                                                //create
                                                refResults.unshift(noNullData)
                                            }
                                        })
                                        _this.updateStoredData({subscription, storedData, resolvedDataJson})
                                    }
                                }
                            }
                        }
                    },
                    error(err) {
                        console.error('err', err)
                    },
                })

            }
        })
    }


    updateStoredData({subscription, storedData, resolvedDataJson}) {
        Hook.call('CmsViewContainerSubscription', {subscription, storedData, resolvedDataJson})
        // back to string data
        const newStoreData = Object.assign({}, storedData)
        newStoreData.cmsPage = Object.assign({}, storedData.cmsPage)
        newStoreData.cmsPage.resolvedData = JSON.stringify(resolvedDataJson)
        // save new data
        client.writeQuery({
            query: getCmsPageQuery(this.props),
            variables: this.props.cmsPageVariables,
            data: newStoreData
        })
    }

    clientQuery(query, options = {}) {
        if (!isString(query)) return

        const {success, error, ...rest} = options
        if (query.startsWith('mutation')) {
            client.mutate({
                mutation: query,
                ...rest
            }).then(success).catch(error)
        } else {
            client.query({
                fetchPolicy: 'network-only',
                query: query,
                ...rest
            }).then(success).catch(error)
        }
    }


    serverMethod(methodName, args, cb) {
        const {slug, _version} = getSlugVersion(this.props.slug)
        client.query({
            fetchPolicy: 'network-only',
            query: 'query cmsServerMethod($slug:String!,$methodName:String!,$args:String,$_version:String,$dynamic:Boolean){cmsServerMethod(slug:$slug,methodName:$methodName,args:$args,_version:$_version,dynamic:$dynamic){result}}',
            variables: {
                _version,
                slug,
                methodName,
                dynamic: this.props.dynamic,
                args: args && (args.constructor === Object || args.constructor === Array) ? JSON.stringify(args) : args
            }
        }).then(cb).catch(cb)
    }

}

/*

CmsViewContainer.propTypes = {
    loading: PropTypes.bool,
    fetchMore: PropTypes.func,
    children: PropTypes.any,
    cmsPageVariables: PropTypes.object,
    cmsPage: PropTypes.object,
    cmsPages: PropTypes.object,
    setKeyValue: PropTypes.func.isRequired,
    getKeyValue: PropTypes.func.isRequired,
    updateResolvedData: PropTypes.func.isRequired,
    slug: PropTypes.string.isRequired,
    user: PropTypes.object.isRequired,
    /!* with Router *!/
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,

    /!* Object is passed to JsonDom *!/
    _props: PropTypes.object,
    /!* if dynamic is set to true that means it is a child of another CmsViewContainer *!/
    dynamic: PropTypes.bool,
    /!* if true data gets refetched with query on url change*!/
    urlSensitiv: PropTypes.any,
    inEditor: PropTypes.bool
}
*/

export default withCms(CmsViewContainer)