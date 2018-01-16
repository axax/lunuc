import Hook from 'util/hook'
import LinkedInProfileContainer from './containers/LinkedInProfileContainer'

Hook.on('JsonDom', ({components}) => {
    components['LinkedInProfile'] = LinkedInProfileContainer
})
