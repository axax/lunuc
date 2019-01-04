import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'

const LinkedInProfileContainer = (props) => <Async {...props}
                                                                                                      load={import(/* webpackChunkName: "social" */ './containers/LinkedInProfileContainer')}/>
const Button = (props) => <Async {...props} expose="Button"
                                 load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const SimpleToolbar = (props) => <Async {...props} expose="SimpleToolbar"
                                        load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

// Styles and scripts can be added like this, but it is recommended to add them on the cms page where they are needed
//Util.addStyle("http://code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css")
//Util.addScript("https://unpkg.com/jspdf@latest/dist/jspdf.min.js")

export default () => {

    Hook.on('JsonDom', ({components}) => {
        components['LinkedInProfile'] = LinkedInProfileContainer
        components['Button'] = Button
        components['LinkedInToolbar'] = ({position, _editmode, ...rest}) => <SimpleToolbar
            position={(_editmode === 'true' ? 'static' : position)} {...rest} />
    })

}