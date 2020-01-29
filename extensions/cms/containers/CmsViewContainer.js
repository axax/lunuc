import React from 'react'
import PropTypes from 'prop-types'
import gql from 'graphql-tag'
import JsonDom from '../components/JsonDom'
import config from 'gen/config'
import {ApolloClient} from 'apollo-client'
import Util from 'client/util'
import DomUtil from 'client/util/dom'
import {getType} from 'util/types'
import {classNameByPath} from '../util/jsonDomUtil'
import {isEditMode, getSlugVersion, getGqlVariables, urlSensitivMap, gqlQuery} from '../util/cmsView'
import withCms from './withCms'

class CmsViewContainer extends React.Component {
    oriTitle = document.title
    registeredSubscriptions = {}

    constructor(props) {
        super(props)

        if (!props.dynamic && props.slug)
            document.title = props.slug

        this.setUpSubsciptions(props)
        this.addResources(props)
    }

    shouldComponentUpdate(props) {

        const {cmsPage} = props
        const cmsPageOld = this.props.cmsPage
        if (cmsPage) {
            if (!cmsPageOld || (cmsPage.subscriptions !== cmsPageOld.subscriptions)) {
                this.removeSubscriptions()
                this.setUpSubsciptions(props)
            }

            if (!cmsPageOld || cmsPage.resources !== cmsPageOld.resources) {
                this.addResources(props)
            }
        }

        if (!cmsPage && props.loading && this.props.loading) {
            // if there is still no cmsPage and it is still loading
            // there is no need to update
            return false
        }

        // only update if it is needed
        return !cmsPage ||
            !cmsPageOld ||
            cmsPage.slug !== cmsPageOld.slug ||
            cmsPage.modifiedAt !== cmsPageOld.modifiedAt ||
            cmsPage.resolvedData !== cmsPageOld.resolvedData ||
            (!props.renewing && this.props.renewing) ||
            (
                cmsPage.urlSensitiv && (
                    props.location.search !== this.props.location.search ||
                    props.location.hash !== this.props.location.hash)
            ) ||
            props.user !== this.props.user ||
            props.children != this.props.children ||
            Util.shallowCompare(props._props, this.props._props) ||
            /* only if in edit mode */
            (!props.dynamic && isEditMode(props) && (
                cmsPage.template !== cmsPageOld.template ||
                cmsPage.script !== cmsPageOld.script ||
                cmsPage.style !== cmsPageOld.style ||
                props.cmsEditData !== this.props.cmsEditData ||
                /* becuase it is passed to the JsonDom */
                this.props.settings.inlineEditor !== props.settings.inlineEditor))

    }

    componentDidMount() {
        this.setUpSubsciptions(this.props)
    }

    componentWillUnmount() {
        if (!this.props.dynamic) {
            document.title = this.oriTitle
        }
        this.removeSubscriptions()
    }

    render() {
        const {slug, cmsPage, children, dynamic, fetchMore, settings, setKeyValue, ...props} = this.props
        const editMode = isEditMode(this.props)
        if (!cmsPage) {
            // show a loader here
            return null //<div className={classNameByPath(slug, 'Cms--loading')}/>
        } else {
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
            template={cmsPage.template}
            script={cmsPage.script}
            style={cmsPage.style}
            resolvedData={cmsPage.resolvedData}
            parseResolvedData={cmsPage.parseResolvedData}
            resources={cmsPage.resources}
            editMode={editMode}
            inlineEditor={settings && !!settings.inlineEditor}
            slug={slug}
            dynamic={dynamic}
            subscriptionCallback={cb => {
                this._subscriptionCallback = cb
            }}
            onFetchMore={(query, cb) => {
                fetchMore({
                    variables: {
                        query
                    },
                    updateQuery: (prev, {fetchMoreResult}) => {
                        cb(fetchMoreResult)
                    }
                })
            }}
            {...props}>{children}</JsonDom>


        console.info(`render ${this.constructor.name} for ${slug} (loading=${this.props.loading}) in ${new Date() - startTime}ms / time since index.html loaded ${(new Date()).getTime() - _app_.start.getTime()}ms`)
        return content
    }


    addResources(props) {
        const {dynamic, cmsPage} = props

        if (cmsPage && (!dynamic || cmsPage.alwaysLoadAssets)) {
            const {resources} = cmsPage

            DomUtil.removeElements(`[data-cms-view]`)
            if (resources) {
                console.log('refresh resources', props.slug)

                try {
                    const a = JSON.parse(resources)
                    for (let i = 0; i < a.length; i++) {
                        let r = a[i].replace('${build}', ''), ext, params

                        if (r.startsWith('[')) {
                            params = r.substring(1, r.indexOf(']'))
                            r = r.substring(r.indexOf(']') + 1)
                            ext = params
                        }

                        if (!ext) {
                            ext = r.substring(r.lastIndexOf('.') + 1)
                        }

                        if (!params) {
                            if (r.indexOf('?') >= 0) {
                                r += '&'
                            } else {
                                r += '?'
                            }
                            r += 'v=' + config.BUILD_NUMBER
                        }

                        if (ext.indexOf('css') === 0) {
                            DomUtil.addStyle(r, {
                                data: {cmsView: true}
                            })
                        } else if (ext.indexOf('js') === 0) {
                            DomUtil.addScript(r, {
                                data: {cmsView: true}
                            })
                        }
                    }
                } catch (e) {
                    console.error('Error in resources', e)
                }
            }
        }
    }


    removeSubscriptions() {
        // remove all subscriptions
        Object.keys(this.registeredSubscriptions).forEach(key => {
            this.registeredSubscriptions[key].unsubscribe()
            delete this.registeredSubscriptions[key]
        })
    }


    setUpSubsciptions(props) {
        if (!props.cmsPage) return

        const {cmsPage: {subscriptions}, client, slug} = props
        if (!subscriptions) return

        // remove unsed subscriptions
        Object.keys(this.registeredSubscriptions).forEach(key => {
            if (subscriptions.indexOf(key) < 0) {
                this.registeredSubscriptions[key].unsubscribe()
                delete this.registeredSubscriptions[key]
            }
        })

        const _this = this

        // register new supscriptions
        subscriptions.forEach(subs => {

            if (!this.registeredSubscriptions[subs]) {
                let query = '', subscriptionName = '', isTypeSubscription = false
                if (subs.indexOf('{') === 0) {
                    const obj = JSON.parse(subs)
                    subscriptionName = Object.keys(obj)[0]
                    query = `${obj[subscriptionName]}`

                } else {
                    isTypeSubscription = true
                    const type = getType(subs)
                    subscriptionName = `subscribe${subs}`
                    if (type) {
                        query += 'action data{_id'
                        type.fields.map(({name, required, multi, reference, localized}) => {

                            if (reference) {
                                // todo: field name might be different than name
                                //query += ' ' + name + '{_id name}'
                            } else {
                                if (localized) {
                                    query += ' ' + name + '{' + _app_.lang + '}'
                                } else {
                                    query += ' ' + name
                                }
                            }
                        })
                        query += '}'
                    }
                }

                if (!query) return

                const qqlSubscribe = gql`subscription{${subscriptionName}{${query}}}`
                this.registeredSubscriptions[subs] = client.subscribe({
                    query: qqlSubscribe,
                    variables: {}
                }).subscribe({
                    next(supscriptionData) {

                        if (!isTypeSubscription) {
                            // this kind of subscription is handle by the JsonDom Script
                            _this._subscriptionCallback(supscriptionData)
                            return
                        }
                        if (!supscriptionData.data) {
                            //console.warn('subscription data missing')
                            return
                        }
                        const {action, data} = supscriptionData.data['subscribe' + subs]
                        if (data) {

                            const storedData = client.readQuery({
                                query: gqlQuery(),
                                variables: _this.props.cmsPageVariables
                            })

                            // upadate data in resolvedData string
                            if (storedData.cmsPage && storedData.cmsPage.resolvedData) {

                                const resolvedDataJson = JSON.parse(storedData.cmsPage.resolvedData)
                                if (resolvedDataJson[subs] && resolvedDataJson[subs].results) {


                                    const refResults = resolvedDataJson[subs].results

                                    // remove null values from new data
                                    const noNullData = Util.removeNullValues(data)
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

                                        // find data to update
                                        const idx = refResults.findIndex(o => o._id === data._id)

                                        if (idx > -1) {
                                            if (action === 'update') {
                                                // update data
                                                refResults[idx] = Object.assign({}, refResults[idx], noNullData)
                                            } else {
                                                // delete data
                                                refResults.splice(idx, 1)
                                            }
                                        } else {
                                            console.warn(`Data ${data._id} does not exist.`)
                                        }

                                    } else {
                                        //create
                                        refResults.unshift(noNullData)

                                    }

                                    // back to string data
                                    const newStoreData = Object.assign({}, storedData)
                                    newStoreData.cmsPage = Object.assign({}, storedData.cmsPage)
                                    newStoreData.cmsPage.resolvedData = JSON.stringify(resolvedDataJson)

                                    // save new data
                                    client.writeQuery({
                                        query: gqlQuery(),
                                        variables: _this.props.cmsPageVariables,
                                        data: newStoreData
                                    })
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


    clientQuery(query, options) {
        const {client} = this.props
        if (!query || query.constructor !== String) return

        const {success, error, ...rest} = options

        if (query.startsWith('mutation')) {
            client.mutate({
                mutation: gql(query),
                ...rest
            }).then(success).catch(error)
        } else {
            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gql(query),
                ...rest
            }).then(success).catch(error)
        }
    }


    serverMethod(methodName, args, cb) {
        const {slug, _version} = getSlugVersion(this.props.slug)
        this.props.client.query({
            fetchPolicy: 'network-only',
            forceFetch: true,
            query: gql('query cmsServerMethod($slug:String!,$methodName:String!,$args:String,$_version:String){cmsServerMethod(slug:$slug,methodName:$methodName,args:$args,_version:$_version){result}}'),
            variables: {
                _version,
                slug,
                methodName,
                args: args && (args.constructor === Object || args.constructor === Array) ? JSON.stringify(args) : args
            }
        }).then(cb).catch(cb)
    }

}


CmsViewContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    loading: PropTypes.bool,
    renewing: PropTypes.bool,
    aboutToChange: PropTypes.bool,
    fetchMore: PropTypes.func,
    children: PropTypes.any,
    cmsPageVariables: PropTypes.object,
    cmsPage: PropTypes.object,
    cmsPages: PropTypes.object,
    keyValue: PropTypes.object,
    setKeyValue: PropTypes.func.isRequired,
    slug: PropTypes.string.isRequired,
    user: PropTypes.object.isRequired,
    /* with Router */
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    /* Object is passed to JsonDom */
    _props: PropTypes.object,
    /* if dynamic is set to true that means it is a child of another CmsViewContainer */
    dynamic: PropTypes.bool,
    /* if true data gets refetched with query on url change*/
    urlSensitiv: PropTypes.bool,
    inEditor: PropTypes.bool
}

export default withCms(CmsViewContainer)
