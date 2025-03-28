import React, {useState} from 'react'
import {
    SimpleDialog,
    Box
} from 'ui/admin'
import {COLLECTIONS_SYNC_QUERY} from '../../constants/index.mjs'
import {client} from '../../middleware/graphql'
import {_t} from 'util/i18n.mjs'
import SelectCollection from './SelectCollection'

const SyncCollectionDialog = ({type, open, entries, onClose, _version}) => {
    const [collection, setCollection] = useState(null)
    return <SimpleDialog key="syncDialog"
                            title={_t('TypesContainer.syncEntry')}
                            fullScreen={false}
                            open={open}
                            onClose={(e)=>{
                                if(e.key==='ok' && collection) {
                                    client.mutate({
                                        mutation: COLLECTIONS_SYNC_QUERY,
                                        variables: {
                                            fromVersion: _version,
                                            toVersion: collection,
                                            type,
                                            ids:entries.map(f=>f._id)
                                        },
                                        update: (store, {data}) => {
                                        }
                                    })


                                }
                                onClose(e)
                            }}
                            actions={[{key: 'cancel', label: _t('core.cancel')},{
                                key: 'ok',
                                label: 'Ok',
                                type: 'primary'
                            }]}>
        <Box
            noValidate
            component="form"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                m: 'auto',
                width: 'fit-content',
            }}
        >
        {_version}
        <SelectCollection type={type}
                          value={collection}
                          ignore={[_version]}
                          onChange={(e) => {
                              setCollection(e.target.value)
                          }}/>
        </Box>
    </SimpleDialog>
}

export default SyncCollectionDialog
