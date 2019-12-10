import React from 'react'
import {isEditMode} from '../util/cmsView'
import Async from 'client/components/Async'

const CmsViewEditorContainer = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ './CmsViewEditorContainer')}/>

// enhance cmsview with editor functionalities if in edit mode
export default function withCmsEditor(WrappedComponent) {
    return class extends React.Component {
        constructor(props) {
            super(props)
        }

        render() {
            if(isEditMode(this.props)){
                return <CmsViewEditorContainer WrappedComponent={WrappedComponent} {...this.props} />
            }else{
                return <WrappedComponent {...this.props}/>
            }
        }
    }
}
