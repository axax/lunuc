import React from 'react'
import Hook from 'util/hook.cjs'
import Async from '../../client/components/Async'
import {CAPABILITY_ADMIN_OPTIONS} from '../../util/capabilities.mjs'
import {_t, registerTrs} from '../../util/i18n.mjs'
import Util from '../../client/util/index.mjs'
import {translations} from './translations/admin'
import {getTypeQueries} from "../../util/types.mjs";
import {client} from "../../client/middleware/graphql";
registerTrs(translations, 'StaticFile')

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>

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

    // add some extra data to the table
    Hook.on('TypeCreateEdit', function ({type, props, parentRef}) {
        if (type === 'StaticFile') {
            props.children = [props.children, <FileDrop key="fileDrop"
                                                        multi={false}
                                                        accept="*/*"
                                                        maxSize={10000}
                                                        imagePreview={false}
                                                        onDataUrl={(file,dataUrl) => {

                                                            const form = parentRef.createEditForm

                                                            form.handleInputChange({
                                                                target: {
                                                                    name: 'content',
                                                                    value: dataUrl
                                                                }
                                                            })

                                                            //form.setState({fields: {...form.state.fields, content:dataUrl}})
                                                        }}/>]
        }
    })




    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions}) {
        if (type === 'StaticFile') {



            if(Util.hasCapability({userData: _app_.user}, CAPABILITY_ADMIN_OPTIONS)) {
                actions.push(
                    {
                        divider: true,
                        icon: 'multiUpload',
                        name: _t('StaticFile.multiUpload'), onClick: () => {
                            const queries = getTypeQueries(type)
                            const prefix = 'icons/'
                            this.setState({simpleDialog: {title:_t('StaticFile.multiUpload'),children: <><FileDrop key="fileDrop"
                                                                              multi={true}
                                                                              accept="image/svg+xml"
                                                                              maxSize={10000}
                                                                              imagePreview={false}
                                                                              onFileContent={(file,content) => {

                                                                                  const addProto = (text) =>{
                                                                                      const el = document.getElementById('multiUploadProto')
                                                                                      el.value += text
                                                                                  }

                                                                                  client.query({
                                                                                      fetchPolicy: 'network-only',
                                                                                      query: `query staticFiles($sort:String,$limit:Int,$page:Int,$filter:String){staticFiles(sort:$sort,limit:$limit,page:$page,filter:$filter){limit offset total meta results{_id}}}`,
                                                                                      variables: {filter: `name==${prefix}${file.name}`}
                                                                                  }).then(response => {
                                                                                      if(response?.data?.staticFiles?.results?.length==1){
                                                                                          addProto(`Replace ${file.name}\n`)
                                                                                          client.mutate({
                                                                                              mutation: queries.update,
                                                                                              variables: {
                                                                                                  _id: response.data.staticFiles.results[0]._id,
                                                                                                  content
                                                                                              }
                                                                                          })
                                                                                      }else{
                                                                                          addProto(`Added ${file.name}\n`)
                                                                                          client.mutate({
                                                                                              mutation: queries.create,
                                                                                              variables: {
                                                                                                  content,
                                                                                                  name:`${prefix}${file.name}`,
                                                                                                  mimeType:'image/svg+xml',
                                                                                                  active: true
                                                                                              }
                                                                                          })
                                                                                      }
                                                                                  }).catch(error => {

                                                                                      addProto(`File ${file.name} error ${error.message}\n`)
                                                                                  })
                                                                              }}/><textarea id="multiUploadProto" placeholder={'Protocol'} style={{marginTop:'2rem',width:'100%',height:'5rem',border:'solid 1px rgb(234,234,234)'}}></textarea></>

                            }})

                        }
                    })
            }
        }
    })

}
