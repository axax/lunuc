import Hook from '../../util/hook.cjs'
import React from 'react'
import {
    SimpleSwitch
} from 'ui/admin'
import {_t, registerTrs} from '../../util/i18n.mjs'
import {translations} from './translations/translations'
import {AnalyticsToolbarButton, AnalyticsPanel} from './components/PageAnalytics'

registerTrs(translations, 'UserTracking')

const ANALYTICS_TAB = 'analytics'
// the tab needs some height for the chart
const MIN_BOX_HEIGHT = 320

registerTrs({
    de: {
        'CmsViewEditorContainer.usertracking': 'Analytics',
        'UserTracking.editor.title': 'Analytics',
        'UserTracking.editor.buttonTitle': 'Seitenaufrufe der letzten 30 Tage – klicken für Details',
        'UserTracking.editor.views': 'Seitenaufrufe',
        'UserTracking.editor.viewsShort': 'Aufrufe',
        'UserTracking.editor.viewsPerDay': 'Aufrufe pro Tag',
        'UserTracking.editor.avgTime': 'Ø Verweildauer',
        'UserTracking.editor.avgScroll': 'Ø Scrolltiefe',
        'UserTracking.editor.entriesExits': 'Einstiege / Ausstiege',
        'UserTracking.editor.entryRate': '%n% % der Aufrufe sind Einstiege',
        'UserTracking.editor.lastVisit': 'Letzter Aufruf',
        'UserTracking.editor.justNow': 'gerade eben',
        'UserTracking.editor.minutesAgo': 'vor %n% Min.',
        'UserTracking.editor.hoursAgo': 'vor %n% Std.',
        'UserTracking.editor.olderThanDay': 'letzter Tag mit Aufrufen',
        'UserTracking.editor.noViews': 'keine Aufrufe im Zeitraum',
        'UserTracking.editor.new': 'neu',
        'UserTracking.editor.vsPrevious': 'ggü. Vorperiode',
        'UserTracking.editor.previous': 'Vorperiode',
        'UserTracking.editor.currentPeriod': 'Zeitraum',
        'UserTracking.editor.previousPeriod': 'Vorperiode',
        'UserTracking.editor.comparedTo': 'letzte %days% Tage, verglichen mit den %days% Tagen davor',
        'UserTracking.editor.daysShort': 'T',
        'UserTracking.editor.today': 'heute',
        'UserTracking.editor.loading': 'Lade Daten…',
        'UserTracking.editor.reload': 'Neu laden',
        'UserTracking.editor.allAnalytics': 'Alle Analytics',
        'UserTracking.editor.error': 'Daten konnten nicht geladen werden',
        'UserTracking.editor.empty': 'Für diese Seite gibt es im gewählten Zeitraum noch keine Aufrufe.'
    },
    en: {
        'CmsViewEditorContainer.usertracking': 'Analytics',
        'UserTracking.editor.title': 'Analytics',
        'UserTracking.editor.buttonTitle': 'Page views of the last 30 days – click for details',
        'UserTracking.editor.views': 'Page views',
        'UserTracking.editor.viewsShort': 'views',
        'UserTracking.editor.viewsPerDay': 'Views per day',
        'UserTracking.editor.avgTime': 'Avg. time on page',
        'UserTracking.editor.avgScroll': 'Avg. scroll depth',
        'UserTracking.editor.entriesExits': 'Entries / exits',
        'UserTracking.editor.entryRate': '%n% % of the views are entries',
        'UserTracking.editor.lastVisit': 'Last view',
        'UserTracking.editor.justNow': 'just now',
        'UserTracking.editor.minutesAgo': '%n% min ago',
        'UserTracking.editor.hoursAgo': '%n% h ago',
        'UserTracking.editor.olderThanDay': 'last day with views',
        'UserTracking.editor.noViews': 'no views in this period',
        'UserTracking.editor.new': 'new',
        'UserTracking.editor.vsPrevious': 'vs. previous period',
        'UserTracking.editor.previous': 'Previous period',
        'UserTracking.editor.currentPeriod': 'Period',
        'UserTracking.editor.previousPeriod': 'Previous period',
        'UserTracking.editor.comparedTo': 'last %days% days, compared to the %days% days before',
        'UserTracking.editor.daysShort': 'd',
        'UserTracking.editor.today': 'today',
        'UserTracking.editor.loading': 'Loading…',
        'UserTracking.editor.reload': 'Reload',
        'UserTracking.editor.allAnalytics': 'All analytics',
        'UserTracking.editor.error': 'Data could not be loaded',
        'UserTracking.editor.empty': 'There are no views of this page in this period yet.'
    }
}, 'UserTrackingEditor')

export default () => {

    // tab "Analytics" in the bottom tool bar of the cms editor
    Hook.on('CmsPageToolsTabs', ({tabs, editorOptions}) => {
        if (editorOptions.tracking) {
            tabs.push({
                name: ANALYTICS_TAB,
                label: () => _t('UserTracking.editor.title'),
                icon: 'barchart',
                render: ({height, data}) => <AnalyticsPanel slug={data.slug} height={height}/>
            })
        }
    })

    Hook.on('CmsViewEditorContainerRender', function ({isSmallScreen, toolbarRight, moreMenu, EditorOptions}) {

        if (isSmallScreen) {
            return
        }
        const slug = this.props.cmsPage && this.props.cmsPage.realSlug

        if (EditorOptions.tracking && slug !== undefined && !this.props.dynamic && !this.isLocal) {
            const open = !!EditorOptions.devTools && EditorOptions.devToolsTab === ANALYTICS_TAB
            // left of the switch "Bearbeitungsmodus", otherwise before the "Admin" button and the menu
            const editSwitchIndex = toolbarRight.findIndex(el => el && el.key === 'inlineEditorSwitch')
            toolbarRight.splice(editSwitchIndex >= 0 ? editSwitchIndex : Math.max(toolbarRight.length - 2, 0), 0,
                <AnalyticsToolbarButton key="usertrackingButton" slug={slug} active={open} onClick={() => {
                    if (open) {
                        this.handleSettingChange('devToolsTab', false, false)
                        return
                    }
                    const changes = []
                    if (!EditorOptions.devTools) changes.push(['devTools', true])
                    if ((EditorOptions.devToolsBoxHeight || 200) < MIN_BOX_HEIGHT) {
                        changes.push(['devToolsBoxHeight', MIN_BOX_HEIGHT])
                        this.setState({liveDevToolsBoxHeight: MIN_BOX_HEIGHT})
                    }
                    changes.push(['devToolsTab', ANALYTICS_TAB])
                    // one after the other: handleSettingChange reads the state that is not updated yet
                    const next = () => {
                        const [key, value] = changes.shift()
                        this.handleSettingChange(key, false, value, changes.length ? next : undefined)
                    }
                    next()
                }}/>)
        }

        moreMenu.push({
            component: <SimpleSwitch key="usertrackingSwitch" color="default"
                                     checked={!!EditorOptions.tracking}
                                     onChange={(e) => {
                                         // no reload needed any more, the data is loaded by the button / tab
                                         this.handleSettingChange('tracking', false, e)
                                     }}
                                     contrast
                                     label={_t('CmsViewEditorContainer.usertracking')}/>
        })
    })
}
