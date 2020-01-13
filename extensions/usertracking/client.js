import Hook from '../../util/hook'
import React from 'react'
import {getTypeQueries} from 'util/types'

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
    Hook.on('JsonDomUserEvent', ({event, payload, container}) => {
        if (payload._track) {
            const queries = getTypeQueries('UserTracking')
            console.log(queries.create)
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
