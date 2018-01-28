import './style.less'
import React from 'react'
import PropTypes from 'prop-types'
import {DrawerLayout, Button} from 'ui/admin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'


class PrettyResume extends React.Component {


    render() {
        const {resumeData} = this.props

        return <div className="LinkedInResume">
            <div className="cv-section profile">

                <a className="cv-profile-picture" target="_blank" href={resumeData.publicProfileUrl}>
                    <img src={resumeData.pictureUrl} alt="Linkedin profile picture"/>
                </a>

                <div className="cv-profile-body">
                    <h1 className="cv-profile-title"><span>editable</span></h1>

                    <h2 className="cv-profile-subtitle"><span>editable</span></h2>

                    <ul className="cv-profile-meta">
                        <li>
                            <i className="ion-ios-location"></i>
                            <span>location</span>
                        </li>
                        <li>
                            <i className="ion-email"></i>
                            <span>email</span>
                        </li>
                        <li>
                            <i className="ion-ios-telephone"></i>
                            <span>phone</span>
                        </li>
                        <li>
                            <i className="ion-earth"></i>
                            <span></span>
                        </li>
                        <li>
                            <i className="ion-ios-chatbubble"></i>
                            <span></span>
                        </li>

                    </ul>


                </div>


                <div className="cv-profile-description">
                    {resumeData.summary}
                </div>

            </div>
        </div>
    }
}


PrettyResume.propTypes = {
    resumeData: PropTypes.object.isRequired
}


export default PrettyResume

