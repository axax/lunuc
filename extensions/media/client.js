import React from 'react'
import {lazy} from 'client/components/Async'
import config from 'gen/config-client'
const {ADMIN_BASE_URL} = config
import Hook from 'util/hook.cjs'
import {CAPABILITY_MEDIA_REFERENCES} from "./constants/index.mjs";
const TypesContainer = lazy(() => import(/* webpackChunkName: "admin" */ '../../client/containers/TypesContainer'))

// add routes
Hook.on('Routes', ({routes, container}) => {
    routes.push({
        private: true,
        exact: true,
        path: ADMIN_BASE_URL + '/medias/:page*',
        layout:'base',
        component: (p) => {
            return <TypesContainer baseUrl={ADMIN_BASE_URL + "/medias/"} fixType="Media"
                                   title="Media" {...p} />
        }
    })
}, 99)


// cms component for excel tables (element «Excel-Tabelle»)
const ExcelTable = lazy(() => import(/* webpackChunkName: "excel" */ './components/ExcelTable'))

// cms component for static html pages in a sandboxed iframe (element «iFrame» with a html file)
const HtmlEmbed = lazy(() => import(/* webpackChunkName: "htmlembed" */ './components/HtmlEmbed'))

Hook.on('JsonDom', ({components}) => {
    components['ExcelTable'] = ExcelTable
    components['HtmlEmbed'] = HtmlEmbed
})

// excel ui (range picker of a sheet, preview desktop / phone) for scripts of cms pages, e.g. digithal/jahresbericht-import:
// const ui = await _app_.excelUi()  -> loaded on demand as own chunk (nothing is added to the main bundle)
if (typeof _app_ !== 'undefined') {
    _app_.excelUi = () => import(/* webpackChunkName: "excelui" */ './util/excelUi.mjs')
}

// Hook to add user capabilities
Hook.on('userCapabilities', ({capabilities}) => {
    capabilities.push(CAPABILITY_MEDIA_REFERENCES)
})

export default () => {


}
