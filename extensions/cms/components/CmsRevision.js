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

const CodeEditor = (props) => <Async {...props} load={() =>import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

function CmsRevisionDialog(props){
    const {onClose, onChange, cmsPage, historyType, revision, canMangeCmsTemplate, ...rest} = props

    // Bei 'all' (chronologisch) den tatsächlichen Typ aus den meta.keys der Revision bestimmen
    let effectiveHistoryType = historyType
    if (historyType === 'all' && revision && revision.meta) {
        try {
            const meta = JSON.parse(revision.meta)
            const keys = meta.keys || []
            if (keys.indexOf('template') >= 0) effectiveHistoryType = 'template'
            else if (keys.indexOf('style') >= 0) effectiveHistoryType = 'style'
            else if (keys.indexOf('dataResolver') >= 0) effectiveHistoryType = 'dataResolver'
            else if (keys.indexOf('serverScript') >= 0) effectiveHistoryType = 'serverScript'
            else if (keys.indexOf('script') >= 0) effectiveHistoryType = 'script'
        } catch (e) { /* ignore */ }
    }

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
            query={`query historys($filter:String){historys(filter:$filter){results{_id action data}}}`}
            fetchPolicy="cache-and-network"
            variables={{
                filter: `_id==${revision._id}`
            }}>
            {({loading, error, data}) => {
                if (loading) return _t('CmsRevision.loading')
                if (error) return _t('CmsRevision.error', {message: error.message})

                if (data.historys.results === 0) return _t('CmsRevision.noEntry')
                parsedData = JSON.parse(data.historys.results[0].data)

                if (effectiveHistoryType === 'dataResolver') {

                    return <div>
                        <Typography gutterBottom>{_t('CmsRevision.dataResolverChanged')}</Typography>

                        <CodeEditor mergeView={true}
                                    style={{border: 0,width:'100%',height:'calc(100vh - 19.8rem)',overflow:'auto'}}
                                    mergeValue={cmsPage.dataResolver}
                                    lineNumbers type="json" readOnly={true}>{parsedData.dataResolver}</CodeEditor>


                    </div>

                } else if (effectiveHistoryType === 'template') {
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
                            {canMangeCmsTemplate && <SimpleTab key="tabCode" label={_t('CmsRevision.code')} />}
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
                            <CodeEditor mergeView={true}
                                        style={{border: 0,width:'100%',height:'calc(100vh - 19.8rem)',overflow:'auto'}}
                                        mergeValue={cmsPage.template}
                                        lineNumbers type="json" readOnly={true}>{parsedData.template}</CodeEditor>
                        </SimpleTabPanel>

                        <Query
                            query={`query historys($limit:Int,$offset:Int,$filter:String){historys(limit:$limit,offset:$offset,filter:$filter){results{_id createdBy{username}}}}`}
                            fetchPolicy="cache-and-network"
                            variables={{
                                offset:1,
                                limit: 999,
                                filter: `data._id==${cmsPage._id} && meta.keys==template`
                            }}>
                            {({loading, error, data}) => {
                                if (error) return _t('CmsRevision.error', {message: error.message})

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
                                        marks={[{value: defaultValue, label: _t('CmsRevision.loading')}]}
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
                } else if (effectiveHistoryType === 'style') {

                    return <div>
                        <Typography gutterBottom>{_t('CmsRevision.styleChanged')}</Typography>

                        <CodeEditor mergeView={true}
                                    style={{border: 0,width:'100%',height:'calc(100vh - 19.8rem)',overflow:'auto'}}
                                    mergeValue={cmsPage.style}
                                    lineNumbers type="css" readOnly={true}>{parsedData.style}</CodeEditor>
                    </div>

                } else if (effectiveHistoryType === 'script') {

                    return <div>
                        <p>{_t('CmsRevision.scriptChanged')}</p>


                        <CodeEditor mergeView={true}
                                    style={{border: 0,width:'100%',height:'calc(100vh - 19.8rem)',overflow:'auto'}}
                                    mergeValue={cmsPage.script}
                                    lineNumbers type="js" readOnly={true}>{parsedData.script}</CodeEditor>

                    </div>

                } else if (effectiveHistoryType === 'serverScript') {

                    return <div>
                        <p>{_t('CmsRevision.serverScriptChanged')}</p>

                        <CodeEditor mergeView={true}
                                    style={{border: 0,width:'100%',height:'calc(100vh - 19.8rem)',overflow:'auto'}}
                                    mergeValue={cmsPage.serverScript}
                                    lineNumbers type="js" readOnly={true}>{parsedData.serverScript}</CodeEditor>

                    </div>

                }
                return <pre>{JSON.stringify(parsedData, null, 2)}</pre>
            }}
        </Query>
    </SimpleDialog>
}

export default function CmsRevision(props){
    const {historyLimit, cmsPage, canMangeCmsTemplate, onTemplateChange, onDataResolverChange, onScriptChange, ...rest} = props

    if(!cmsPage){
        return null
    }

    const [showRevision, setShowRevision] = React.useState(false)
    const [historyType, setHistoryType] = React.useState('template')
    const [historyPage, setHistoryPage] = React.useState(1)

    return <>
        {canMangeCmsTemplate && <SimpleSelect
            fullWidth={true}
            label={_t('CmsRevision.type')}
            value={historyType}
            style={{marginBottom:0,marginTop:0}}
            onChange={(e)=>{
                setHistoryPage(1)
                setHistoryType(e.target.value)
            }}
            items={[{name: _t('CmsRevision.all'), value: 'all'},
                  {name: _t('CmsRevision.script'), value: 'script'},
                {name: _t('CmsRevision.serverScript'), value: 'serverScript'},
                {name: _t('CmsRevision.dataResolver'), value: 'dataResolver'},
                {name: _t('CmsRevision.template'), value: 'template'},
                {name: _t('CmsRevision.style'), value: 'style'}]}
        /> }
        <Query
            query={'query historys($sort:String,$filter:String,$limit:Int,$offset:Int,$page:Int){historys(sort:$sort,filter:$filter,limit:$limit,offset:$offset,page:$page){total offset results{_id action meta createdBy{username}}}}'}
            fetchPolicy="cache-and-network"
            variables={{
                offset:1 + ((historyPage-1) * historyLimit),
                limit: historyLimit,
                sort: '_id desc',
                filter: historyType === 'all'
                     ? `data._id==${cmsPage._id}`
                     : `data._id==${cmsPage._id} && meta.keys==${historyType || 'script'}`
            }}>
            {({loading, error, data}) => {
                if (loading) return <p>{_t('CmsRevision.loading')}</p>
                if (error) return <p>{_t('CmsRevision.error', {message: error.message})}</p>

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
                        secondary = _t('CmsRevision.styleChangedSecondary')
                    } else if (meta.keys.indexOf('dataResolver') >= 0) {
                        secondary = _t('CmsRevision.dataResolverChangedSecondary')
                    } else if (meta.keys.indexOf('serverScript') >= 0) {
                        secondary = _t('CmsRevision.serverScriptChangedSecondary')
                    } else if (meta.keys.indexOf('script') >= 0) {
                        secondary = _t('CmsRevision.scriptChangedSecondary')
                    } else {
                        secondary = _t('CmsRevision.change')
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
                                           historyType={historyType}
                                           onChange={(mark)=>{
                                               setShowRevision(mark)
                                           }}
                                           onClose={(action, cmsPageHistory)=>{
                                                if(action.key==='restore'){

                                                    if(cmsPageHistory.template) {
                                                        onTemplateChange(cmsPageHistory.template,true)
                                                    } else if( cmsPageHistory.dataResolver){
                                                        onDataResolverChange(cmsPageHistory.dataResolver,true)
                                                    } else if( cmsPageHistory.script){
                                                        onScriptChange(cmsPageHistory.script,true)
                                                    }
                                                }
                                                setShowRevision(null)
                                            }} {...rest} /> : null}
    </>
}