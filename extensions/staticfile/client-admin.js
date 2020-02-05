import React, {useState} from 'react'
import Hook from 'util/hook'


export default () => {
    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data}) => {
        if (type === 'StaticFile') {
            dataSource.forEach((d, i) => {
                const item = data.results[i]

                if (item) {
                    d.name =
                        <a target="_blank" rel="noopener noreferrer" href={`/${item.name}`}>
                            {item.name}
                        </a>
                }
            })
        }
    })
}
