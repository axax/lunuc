import './style.less'
import React from 'react'
import PropTypes from 'prop-types'
import {DrawerLayout, Button} from 'ui/admin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'


class PrettyResume extends React.Component {


    timeago(start, end) {
        const sDate = (start ? new Date(start) : new Date()), eDate = (end ? new Date(end) : new Date())

        const years = eDate.getFullYear() - sDate.getFullYear(),
            months = sDate.getMonth() + 1 + eDate.getMonth()

        if (years > 0) {
            return `${years > 0 ? years + ' year' + (years > 1 ? 's' : '') : ''}  ${months} month${months > 1 ? 's' : ''}`
        }

    }

    renderTimeline(p){
        return <div className="timeline-left">
            <span suppressContentEditableWarning={true} contentEditable>{p.startedOn}</span> -&nbsp;
            <span suppressContentEditableWarning={true}
                  contentEditable>{p.finishedOn || 'Present'}</span><br />
            <small suppressContentEditableWarning={true}
                   contentEditable>{this.timeago(p.startedOn, p.finishedOn)}</small>
        </div>
    }


    render() {
        const {resumeData} = this.props


        console.log(resumeData)

        return <div className="linkedin-resume">
            <div className="cv-section profile">

                <a className="cv-profile-picture" target="_blank" href={resumeData.publicProfileUrl}>
                    <img src={resumeData.pictureUrl} alt="Linkedin profile picture"/>
                </a>

                <div className="cv-profile-body">
                    <h1 className="cv-profile-title"><span suppressContentEditableWarning={true}
                                                           contentEditable>{resumeData.firstName} {resumeData.lastName}</span>
                    </h1>

                    <h2 className="cv-profile-subtitle"><span suppressContentEditableWarning={true}
                                                              contentEditable>{resumeData.headline}</span></h2>

                    <ul className="cv-profile-meta">
                        <li>
                            <i className="ion-ios-location"></i>
                            <span suppressContentEditableWarning={true} contentEditable>{resumeData.country}</span>
                        </li>
                        <li>
                            <i className="ion-email"></i>
                            <span suppressContentEditableWarning={true} contentEditable>email</span>
                        </li>
                        <li>
                            <i className="ion-ios-telephone"></i>
                            <span suppressContentEditableWarning={true} contentEditable>phone</span>
                        </li>
                        <li>
                            <i className="ion-earth"></i>
                            <span suppressContentEditableWarning={true}
                                  contentEditable>{resumeData.websites && resumeData.websites.split(':')[1]}</span>
                        </li>
                        <li>
                            <i className="ion-ios-chatbubble"></i>
                            <span suppressContentEditableWarning={true} contentEditable>info</span>
                        </li>

                    </ul>


                </div>


                <div className="cv-profile-description">
                    {resumeData.summary}
                </div>

            </div>


            <div className="cv-section timeline">
                <div className="timeline-starter"></div>

                {resumeData.positions &&
                <div className="section-position">
                    <h2 className="section-title">
                        <span suppressContentEditableWarning={true} contentEditable>Experience</span>
                    </h2>

                    { resumeData.positions.values.map((p, i) =>
                        <div key={i} className="timeline-section">

                            {this.renderTimeline(p)}

                            <div className="timeline-right">
                                <h3><span suppressContentEditableWarning={true} contentEditable>{p.title}</span></h3>
                                <h4><span suppressContentEditableWarning={true} contentEditable>{p.companyName}</span>
                                </h4>
                                {p.location &&
                                <div className="timeline-location">
                                    <i className="ion-ios-location"></i> <span>{p.location}</span>
                                </div>
                                }
                                <p>
                                    <span suppressContentEditableWarning={true}
                                          contentEditable>{p.summary || p.description}</span>
                                </p>


                            </div>

                        </div>
                    )}
                </div> }

                {resumeData.education &&
                <div  className="section-education">
                    <h2 className="section-title timeline-seperator">
                        <span suppressContentEditableWarning={true} contentEditable>Education</span>
                    </h2>

                    { resumeData.education.values.map((p, i) =>
                        <div key={i} className="timeline-section">

                            <div className="timeline-left">
                                <span suppressContentEditableWarning={true} contentEditable>{p.startDate} - {p.endDate}</span>
                            </div>


                            <div className="timeline-right">
                                <h3><span suppressContentEditableWarning={true} contentEditable>{p.schoolName}</span></h3>
                                <h4><span suppressContentEditableWarning={true} contentEditable>{p.degreeName}</span></h4>
                                <p>
                                    <span suppressContentEditableWarning={true} contentEditable>{p.notes}</span>
                                </p>
                            </div>

                        </div>)}
                </div>
                }


                {resumeData.projects &&
                <div  className="section-projects">
                    <h2 className="section-title timeline-seperator">
                        <span suppressContentEditableWarning={true} contentEditable>Projects</span>
                    </h2>

                    { resumeData.projects.values.map((p, i) =>
                        <div key={i} className="timeline-section">

                            <div className="timeline-left">
                                <span suppressContentEditableWarning={true} contentEditable>{p.startDate} - {p.endDate || 'Today'}</span>
                            </div>


                            <div className="timeline-right">
                                <h3><span suppressContentEditableWarning={true} contentEditable>{p.title}</span></h3>
                                <p>
                                    <span suppressContentEditableWarning={true} contentEditable>{p.description}</span>
                                </p>
                            </div>

                        </div>)}
                </div>
                }

            </div>


            <div className="cv-section blocks">
                <div className="row">
                    <div className="col-md-12">
                        <h2 className="section-title">
                            <span>linkedinData.extracted.skills.title</span>
                        </h2>


                        <ul className="pills">
                            <li>
                                <span className="label label-pill">skill.title</span>

                            </li>
                        </ul>

                    </div>

                    <div className="col-md-4">
                        <h2 className="section-title">
                            <span>linkedinData.extracted.courses.title</span>
                        </h2>

                        <ul>
                            <li>
                                <span>course.title</span>

                            </li>
                        </ul>


                    </div>

                    <div className="col-md-4">
                        <h2 className="section-title">
                            <span>linkedinData.extracted.interests.title</span>
                        </h2>

                        <ul>
                            <li>
                                <span>interest.title</span><br />
                            </li>
                        </ul>

                    </div>

                    <div className="col-md-4">
                        <h2 className="section-title">
                            <span>Languages</span>
                        </h2>


                        <ul>
                            <li>
                                <span></span><br />
                                <small></small>
                            </li>
                        </ul>

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

