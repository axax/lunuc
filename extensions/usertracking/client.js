import Hook from '../../util/hook'
import {Link} from 'react-router-dom'
import React from 'react'

export default () => {
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'UserTracking') {
            dataSource.forEach((d, i) => {
                if (d.ip) {
                    const item = data.results[i]
                    d.ip = <Link
                        target="_blank"
                        to={`/system/iplocation?ip=${item.ip}`}>
                        <span
                            style={{
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                color: '#663366',
                                textDecoration: 'underline'
                            }}>{item.ip}</span></Link>
                }
            })
        }
    })
}
