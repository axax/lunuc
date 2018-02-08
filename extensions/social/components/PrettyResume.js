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


            <div className="cv-section timeline">
                <div className="timeline-starter"></div>

                <div>
                    <h2 className="section-title">
                        <span>linkedinData.extracted.experience.title</span>
                    </h2>


                    <div className="timeline-section">

                        <div className="timeline-left">
                            <span>position.date_from</span> -
                            <span>position.date_to</span><br />
                            <small>position.period</small>

                        </div>


                        <div className="timeline-right">
                            <h3><span>position.title</span></h3>
                            <h4><span>position.subtitle</span></h4>
                            <p>
                                <span>position.description</span>
                            </p>


                        </div>

                    </div>
                </div>


                <div>
                    <h2 class="section-title timeline-seperator">
                        <span>linkedinData.extracted.education.title</span>
                    </h2>

                    <div class="timeline-section">

                        <div class="timeline-left">
                            <span>school.date_range</span>
                        </div>


                        <div class="timeline-right">
                            <h3><span>school.title</span></h3>
                        <h4><span>school.subtitle</span></h4>
                    <div class="timeline-location">
                        <i class="ion-ios-location"></i> <span>school.location</span>
                    </div>
                    <p>
                        <span>school.description</span>
                    </p>
                </div>

            </div>
        </div>

    </div>


    </div>

    }
}


PrettyResume.propTypes = {
    resumeData: PropTypes.object.isRequired
}


export default PrettyResume

