import Hook from '../../util/hook.cjs'
import React from 'react'
import {
    SimpleSwitch
} from 'ui/admin'
import Util from '../../client/util/index.mjs'
import {_t, registerTrs} from '../../util/i18n.mjs'
import {translations} from './translations/translations'
registerTrs(translations, 'UserTracking')

export default () => {
    Hook.on('CmsViewEditorContainerRender', function ({isSmallScreen, toolbarRight, moreMenu, EditorOptions, inner}) {

        if(this.state.cmsStatusData ){
            const ut = this.state.cmsStatusData.usertracking
            if( ut && ut.lastEntry && inner ) {
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

            registerTrs({
                de:{
                    'CmsViewEditorContainer.usertracking': 'Analytics'
                },
                en:{
                    'CmsViewEditorContainer.usertracking': 'Analytics'
                }
            }, 'usertracking')


            moreMenu.push({
                component:  <SimpleSwitch key="usertrackingSwitch" color="default"
                                          checked={!!EditorOptions.tracking}
                                          onChange={(e) => {
                                              this.handleSettingChange('tracking', false, e,() => {
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
                                          label={_t('CmsViewEditorContainer.usertracking')}/>
            })
            //toolbarRight.splice(2, 0,)
        }
    })
}
