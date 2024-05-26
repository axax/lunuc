import React from 'react'
import {
    SimpleSelect,
    SimpleSwitch
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'

export default function CmsPageOptions(props){

    const {onChange, values, canMangeCmsTemplate} = props

    return <>
        {canMangeCmsTemplate ? <React.Fragment>
                <SimpleSelect
                    fullWidth={true}
                    label="Url sensitive (refresh component on url or props change)"
                    value={values.urlSensitiv == 'true' ? 'full' : values.urlSensitiv}
                    sx={{ mt: 0, mb: 2 }}
                    onChange={(e) => {
                        onChange('urlSensitiv', null, e.target.value)
                    }}
                    items={[{name: 'None', value: ''}, {
                        name: 'Full',
                        value: 'full'
                    }, {name: 'Client (nothing is sent to the server)', value: 'client'}]}
                /><br/>
                <SimpleSwitch
                    label="SSR (Server side Rendering)"
                    checked={!!values.ssr}
                    onChange={onChange.bind(this, 'ssr')}
                /><br/>
                <SimpleSwitch
                    label={_t('CmsViewEditorContainer.public')}
                    checked={!!values.public}
                    onChange={onChange.bind(this, 'public')}
                /><br/>
                <SimpleSwitch
                    label="Always load assets (even when component is loaded dynamically)"
                    checked={!!values.alwaysLoadAssets}
                    onChange={onChange.bind(this, 'alwaysLoadAssets')}
                /><br/>
                <SimpleSwitch
                    label="Load page options"
                    checked={!!values.loadPageOptions}
                    onChange={onChange.bind(this, 'loadPageOptions')}
                /><br/>
                <SimpleSwitch
                    label="Compress response"
                    checked={!!values.compress}
                    onChange={onChange.bind(this, 'compress')}
                /><br/>
                <SimpleSwitch
                    label="Server side style rendering"
                    checked={!!values.ssrStyle}
                    onChange={onChange.bind(this, 'ssrStyle')}
                /><br/>
                <SimpleSwitch
                    label="Page is publicly editable"
                    checked={!!values.publicEdit}
                    onChange={onChange.bind(this, 'publicEdit')}
                /><br/>
                <SimpleSwitch
                    label="Parse resolvedData in frontend (replace placeholders)"
                    checked={!!values.parseResolvedData}
                    onChange={onChange.bind(this, 'parseResolvedData')}
                /></React.Fragment>:
            <React.Fragment>

                <SimpleSwitch
                    label={_t('CmsViewEditorContainer.public')}
                    checked={!!values.public}
                    onChange={onChange.bind(this, 'public')}
                /><br/>

            </React.Fragment>}
    </>

}
