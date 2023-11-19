import {Query} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'
import React from 'react'
import {
    Typography,
    MenuList,
    MenuListItem,
    SimpleSelect,
    SimpleDialog,
    Pagination,
    Stack,
    SimpleTab,
    SimpleTabPanel,
    SimpleTabs,
    Slider
} from 'ui/admin'
import Async from '../../../client/components/Async'
import {_t} from '../../../util/i18n.mjs'
import JsonDomIFrame from './JsonDomIFrame'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

function CmsRevisionDialog(props){
    const {onClose, onChange, cmsPage, revision, canMangeCmsTemplate, ...rest} = props

    let parsedData
    return <SimpleDialog fullWidth={true}
                         maxWidth="lg"
                         fullScreen={true}
                         key="revisionDialog"
                         open={true}
                         onClose={(action)=>{
                             onClose(action, parsedData)
                         }}
                         actions={[
                             {
                                 key: 'restore',
                                 label: _t('CmsRevisionDialog.restore'),
                                 type: 'secondary'
                             },
                             {
                             key: 'ok',
                                 label: _t('CmsRevisionDialog.close'),
                             type: 'primary'
                         }]}
                         title={_t('CmsRevisionDialog.title',{username: revision.createdBy?revision.createdBy.username:'???', date: Util.formattedDateFromObjectId(revision._id)})}>

        <Query
            query={`query historys($filter:String){historys(filter:$filter){results{_id action data createdBy{username}}}}`}
            fetchPolicy="cache-and-network"
            variables={{
                filter: `_id==${revision._id}`
            }}>
            {({loading, error, data}) => {
                if (loading) return 'Loading...'
                if (error) return `Error! ${error.message}`

                if (data.historys.results === 0) return 'No entry'
                parsedData = JSON.parse(data.historys.results[0].data)

                if (parsedData.dataResolver) {

                    return <div>
                        <Typography gutterBottom>Data resolver changed</Typography>

                        <CodeEditor lineNumbers
                                    type="json"
                                    readOnly={true}>{JSON.stringify(JSON.parse(parsedData.dataResolver), null, 2)}</CodeEditor>
                        <a href={'/system/diff?preview=true#value=' + encodeURIComponent(parsedData.dataResolver) + '&orig1=' + encodeURIComponent(cmsPage.dataResolver)}
                           target="_blank">Show diff</a>

                    </div>

                } else if (parsedData.template) {
                    const [tabValue, setTabValue] = React.useState(0)
                    return <>

                        <SimpleTabs
                            style={{width:'100%'}}
                            value={tabValue}
                            onChange={(e, newValue) => {
                                setTabValue(newValue)
                            }}
                        >
                            <SimpleTab key="tabView" label={_t('CmsRevision.view')}/>
                            {canMangeCmsTemplate && <SimpleTab key="tabCode" label="Code"/>}
                        </SimpleTabs>

                        <SimpleTabPanel style={{border:'solid 1px rgba(234,234,234)'}} key="tabPanelView" value={tabValue} index={0}>
                            <JsonDomIFrame style={{border: 0,width:'100%',height:'calc(100vh - 19.8rem)'}}
                            jsonDom={{
                                history:{
                                    listen: ()=>{},
                                    push: ()=>{}
                                },
                                location:{},
                                template:parsedData.template,
                                script:cmsPage.script,
                                style:cmsPage.style,
                                ssrStyle:cmsPage.ssrStyle,
                                resolvedData:cmsPage.resolvedData,
                                parseResolvedData:cmsPage.parseResolvedData,
                                resources:cmsPage.resources,
                                title:cmsPage.name,
                                dynamic:true,
                                editMode:false,
                                inEditor:false,
                                ...rest
                            }}>
                            </JsonDomIFrame>
                        </SimpleTabPanel>

                        <SimpleTabPanel key="tabPanelCode" value={tabValue} index={1}>
                            <CodeEditor lineNumbers type="json" readOnly={true}>{JSON.stringify(JSON.parse(parsedData.template), null, 2)}</CodeEditor>

                            <a href={'/system/diff?preview=true#value=' + encodeURIComponent(parsedData.template) + '&orig1=' + encodeURIComponent(cmsPage.template)}
                               target="_blank">Show diff</a>
                        </SimpleTabPanel>

                        <Query
                            query={`query historys($limit:Int,$filter:String){historys(limit:$limit,filter:$filter){results{_id}}}`}
                            fetchPolicy="cache-and-network"
                            variables={{
                                limit: 999,
                                filter: `data._id==${cmsPage._id} && meta.keys==template`
                            }}>
                            {({loading, error, data}) => {
                                if (error) return `Error! ${error.message}`

                                const defaultValue = Util.dateFromObjectId(revision._id, new Date()).getTime()
                                let year
                                const getLabel = (f)=>{
                                    const d = Util.dateFromObjectId(f._id, new Date())
                                    if(year!==d.getFullYear()){
                                        year=d.getFullYear()
                                        return Util.formattedDateFromObjectId(f._id,{day: undefined, month: undefined, hour:undefined, minute: undefined, second: undefined})
                                    }
                                    return ''
                                }

                                function valuetext(value) {
                                    return marks.findIndex((mark) => mark.value === value) + 1
                                }

                                function valueLabelFormat(value) {
                                    return Util.formattedDatetime(value)
                                }

                                if (!data) {
                                    return <Slider
                                        defaultValue={defaultValue}
                                        valueLabelFormat={valueLabelFormat}
                                        valuetext={valuetext}
                                        step={null}
                                        disabled={true}
                                        valueLabelDisplay="auto"
                                        marks={[{value: defaultValue, label: 'loading'}]}
                                    />
                                }
                                const max = Util.dateFromObjectId(data.historys.results[0]._id, new Date()).getTime()
                                const min = Util.dateFromObjectId(data.historys.results[data.historys.results.length-1]._id, new Date()).getTime()

                                const marks = data.historys.results.map(f=>({
                                    _id:f._id,
                                    value:Util.dateFromObjectId(f._id, new Date()).getTime(),
                                    label: getLabel(f)}))



                                return <Slider
                                    defaultValue={defaultValue}
                                    valueLabelFormat={valueLabelFormat}
                                    valuetext={valuetext}
                                    onChangeCommitted={(e, newValue)=>{
                                        const mark = marks.find((mark) => mark.value === newValue)
                                        onChange(mark)
                                    }}
                                    step={null}
                                    max={max}
                                    min={min}
                                    valueLabelDisplay="auto"
                                    marks={marks}
                                />
                            }}
                        </Query>
                    </>
                } else if (parsedData.style) {

                    return <div>
                        <Typography gutterBottom>Style changed</Typography>

                        <CodeEditor lineNumbers
                                    type="css"
                                    readOnly={true}>{parsedData.style}</CodeEditor>
                        <a href={'/system/diff?preview=true#value=' + encodeURIComponent(parsedData.style) + '&orig1=' + encodeURIComponent(cmsPage.style)}
                           target="_blank">Show diff</a>
                    </div>

                } else if (parsedData.script) {

                    return <div>
                        <p>Script changed</p>

                        <CodeEditor lineNumbers
                                    type="js"
                                    readOnly={true}>{parsedData.script}</CodeEditor>
                        <a href={'/system/diff?preview=true#value=' + encodeURIComponent(parsedData.script) + '&orig1=' + encodeURIComponent(cmsPage.script)}
                           target="_blank">Show diff</a>

                    </div>

                } else if (parsedData.serverScript) {

                    return <div>
                        <p>Server Script changed</p>

                        <CodeEditor lineNumbers
                                    type="js"
                                    readOnly={true}>{parsedData.serverScript}</CodeEditor>
                        <a href={'/system/diff?preview=true#value=' + encodeURIComponent(parsedData.serverScript) + '&orig1=' + encodeURIComponent(cmsPage.serverScript)}
                           target="_blank">Show diff</a>

                    </div>

                }
                return <pre>{JSON.stringify(parsedData, null, 2)}</pre>
            }}
        </Query>
    </SimpleDialog>
}

export default function CmsRevision(props){
    const {historyLimit, cmsPage, canMangeCmsTemplate, onTemplateChange, ...rest} = props

    if(!cmsPage){
        return null
    }

    const [showRevision, setShowRevision] = React.useState(false)
    const [historyType, setHistoryType] = React.useState('template')
    const [historyPage, setHistoryPage] = React.useState(1)

    return <>
        {canMangeCmsTemplate && <SimpleSelect
            fullWidth={true}
            label="Type"
            value={historyType}
            style={{marginBottom:0,marginTop:0}}
            onChange={(e)=>{
                setHistoryPage(1)
                setHistoryType(e.target.value)
            }}
            items={[{name: 'Script', value: 'script'},
                {name: 'Server Script', value: 'serverScript'},
                {name: 'Data Resolver', value: 'dataResolver'},
                {name: 'Template', value: 'template'},
                {name: 'Style', value: 'style'}]}
        /> }
        <Query
            query={'query historys($filter:String,$limit:Int,$page:Int){historys(filter:$filter,limit:$limit,page:$page){total offset results{_id action meta createdBy{username}}}}'}
            fetchPolicy="cache-and-network"
            variables={{
                limit: historyLimit,
                page: historyPage,
                filter: `data._id==${cmsPage._id} && meta.keys==${historyType || 'script'}`
            }}>
            {({loading, error, data}) => {
                if (loading) return <p>Loading...</p>
                if (error) return <p>Error! {error.message}</p>

                const menuItems = []
                data.historys.results.forEach(revision => {
                    const meta = revision.meta ? JSON.parse(revision.meta) : {keys: []}

                    if(!canMangeCmsTemplate && meta.keys.indexOf('template')<0){
                        return
                    }

                    let secondary

                    if (meta.keys.indexOf('template') >= 0) {
                        secondary = _t('CmsRevision.templateChanged')
                    } else if (meta.keys.indexOf('style') >= 0) {
                        secondary = 'Style hat geändert'
                    } else if (meta.keys.indexOf('dataResolver') >= 0) {
                        secondary = 'Data resolver hat geändert'
                    } else if (meta.keys.indexOf('serverScript') >= 0) {
                        secondary = 'Server script hat geändert'
                    } else if (meta.keys.indexOf('script') >= 0) {
                        secondary = 'Script hat geändert'
                    } else {
                        secondary = 'Änderung'
                    }

                    menuItems.push(<MenuListItem key={'history' + revision._id} onClick={() => {
                        setShowRevision(revision)
                    }} button primary={Util.formattedDateFromObjectId(revision._id)} secondary={secondary}
                    />)
                })
                if (menuItems.length === 0) return <p>{_t('CmsRevision.noRevisionEntries')}</p>

                return [
                    <MenuList>
                        {menuItems}
                    </MenuList>,
                    <Stack spacing={2} justifyContent="center" alignItems="center">
                    <Pagination size="medium"
                                showFirstButton
                                showLastButton
                                page={historyPage}
                                onChange={(e, page)=>{
                                    setHistoryPage(page)
                                }}
                                count={Math.ceil(data.historys.total / historyLimit)} />
                    </Stack>]
            }}
        </Query>
        {showRevision ? <CmsRevisionDialog revision={showRevision}
                                           canMangeCmsTemplate={canMangeCmsTemplate}
                                           cmsPage={cmsPage}
                                           onChange={(mark)=>{
                                               setShowRevision(mark)
                                           }}
                                           onClose={(action, cmsPageHistory)=>{
                                                if(action.key==='restore'){
                                                    if(cmsPageHistory.template) {
                                                        onTemplateChange(cmsPageHistory.template,true)
                                                    }
                                                }
                                                setShowRevision(null)
                                            }} {...rest} /> : null}
    </>
}