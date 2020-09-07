import Hook from '../../util/hook'
import React from 'react'
import _t from '../../util/i18n'
import {
    SimpleSwitch
} from 'ui/admin'
import CmsViewEditorContainer from '../../extensions/cms/containers/CmsViewEditorContainer'
import Util from '../../client/util'

export default () => {
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'UserTracking') {
            dataSource.forEach((d, i) => {
                if (d.ip) {
                    const item = data.results[i]
                    d.ip = <a
                        target="_blank"
                        href={`/system/iplocation?ip=${item.ip}`}>
                        <span
                            style={{
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                color: '#663366',
                                textDecoration: 'underline'
                            }}>{item.ip}</span></a>
                }
            })
        }
    })

    Hook.on('CmsViewEditorContainerRender', function ({isSmallScreen, toolbarRight, settings, inner}) {

        if(this.state.cmsStatusData ){
            const ut = this.state.cmsStatusData.usertracking
            if( ut && ut.lastEntry ) {
                inner.push(<div key="usertrackingBox" style={{
                    position: 'fixed',
                    zIndex: 9999, right: '2rem', top: '5rem',
                    background: 'rgba(243, 245, 154,0.9)', padding: '1rem',
                    boxShadow: '1px 2px 10px 0px rgba(0,0,0,0.3)'
                }}>
                    Seitenaufrufe: <strong>{ut.countTotal}</strong><br />
                    Letzter Aufruf: <strong>{Util.formattedDatetimeFromObjectId(ut.lastEntry._id)}</strong>
                </div>)
            }

        }
        if (!isSmallScreen) {
            if (CmsViewEditorContainer.generalSettingsKeys.indexOf('tracking') < 0) {
                CmsViewEditorContainer.generalSettingsKeys.push('tracking')
            }
            toolbarRight.splice(2, 0, <SimpleSwitch key="usertrackingSwitch" color="default"
                                                    checked={!!settings.tracking}
                                                    onChange={(e) => {
                                                        this.handleSettingChange('tracking', e, () => {
                                                            if (this._saveSettings) {
                                                                this._saveSettings(({key}) => {
                                                                    if (key === 'CmsViewContainerSettings') {
                                                                        window.location.href = window.location.href
                                                                    }
                                                                })
                                                            }
                                                        })
                                                    }}
                                                        contrast
                                                        label={_t('CmsViewEditorContainer.usertracking')}/>)
                                                    }
    })
}
