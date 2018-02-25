import React from 'react'
import Hook from 'util/hook'
import LinkedInProfileContainer from './containers/LinkedInProfileContainer'
import Util from 'client/util'
import {SimpleToolbar, Button} from 'ui/admin'


Util.addStyle("http://code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css")
Util.addScript("https://unpkg.com/jspdf@latest/dist/jspdf.min.js")


Hook.on('JsonDom', ({components,props}) => {
    components['LinkedInProfile'] = LinkedInProfileContainer
    components['Button'] = Button
    components['LinkedInToolbar'] = ({position, ...rest}) => <SimpleToolbar
        position={(props.editMode ? 'static' : position)} {...rest} />
})

