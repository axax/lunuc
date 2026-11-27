import styled from '@emotion/styled'

/**
 * Compact data table of /admin/system (indexes, commits).
 * Cell classes: num (right aligned numbers), mono (keys, hashes), nowrap
 */
export const StyledSystemTable = styled('table')(({theme}) => ({
    borderCollapse: 'collapse',
    width: '100%',
    marginBottom: '1.5rem',
    fontSize: '0.8125rem',
    'th, td': {
        textAlign: 'left',
        padding: '0.25rem 0.5rem',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        verticalAlign: 'top'
    },
    th: {whiteSpace: 'nowrap', color: theme.palette.text.secondary, fontWeight: 600},
    'th.num, td.num': {textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'},
    'td.mono': {fontFamily: 'monospace'},
    'td.nowrap': {whiteSpace: 'nowrap'},
    // index never used since the counter started - the drop candidates.
    'tr.unused td': {backgroundColor: 'rgba(255,167,38,0.12)'}
}))

/** label / value list of /admin/system (update, versions) */
export const StyledSystemDl = styled('dl')({
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    gap: '0.25rem 1rem',
    margin: '0 0 1rem',
    dt: {fontWeight: 600},
    dd: {margin: 0}
})
