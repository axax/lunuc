import Hook from '../../util/hook.cjs'
import {getTypeQueries} from 'util/types.mjs'

export default () => {
    Hook.on('JsonDomUserEvent', ({event, payload, container}) => {
        if (payload._track) {
            const queries = getTypeQueries('UserTracking')
            container.props.clientQuery(queries.create, {
                variables: {
                    slug: container.props.slug,
                    data: JSON.stringify(payload._track.data),
                    event
                }
            })
        }
    })
}
