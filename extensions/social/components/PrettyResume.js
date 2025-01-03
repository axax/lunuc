import './style.less'
import React from 'react'
import PropTypes from 'prop-types'
import {DrawerLayout, Button, Row, Col} from 'ui/admin'


class PrettyResume extends React.Component {

    constructor(props) {
        super(props)

        this.state = {
            profileImageData: null
        }
        if (props.resumeData) {
            this.toDataUrl(props.resumeData.pictureUrl, d => {
                this.setState({profileImageData: d})
            })
        }
    }

    UNSAFE_componentWillReceiveProps(props) {
        if (this.props.resumeData && props.resumeData && this.props.resumeData.pictureUrl !== props.resumeData.pictureUrl) {
            this.toDataUrl(props.resumeData.pictureUrl, d => {
                this.setState({profileImageData: d})
            })
        }
    }


    timeago(start, end) {
        const sDate = (start ? new Date(start) : new Date()), eDate = (end ? new Date(end) : new Date())

        let years = eDate.getFullYear() - sDate.getFullYear(),
            months = 0
        if( eDate.getMonth() - sDate.getMonth() < 0){
            years--
            months = 12 - sDate.getMonth() + (eDate.getMonth() + 1)
        }else{
            months = eDate.getMonth() - sDate.getMonth()+1
        }

        if (years > 0) {
            return `${years > 0 ? years + ' year' + (years > 1 ? 's' : '') : ''}  ${months} month${months > 1 ? 's' : ''}`
        }

    }

    renderTimeline(p) {
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
        const {profileImageData} = this.state

        console.log('render PrettyResume')

        return <div className="linkedin-resume">

            <div className="cv-overlay"></div>

            <div className="cv-printarea">

                <div className="cv-printarea-inner">

                    <div className="cv-section profile">

                        <a className="cv-profile-picture" target="_blank" href={resumeData.publicProfileUrl}>
                            <img src={profileImageData || resumeData.pictureUrl} alt="Linkedin profile picture"/>
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
                                    <span suppressContentEditableWarning={true}
                                          contentEditable>{resumeData.country}</span>
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


                        <div className="cv-profile-description" suppressContentEditableWarning={true} contentEditable>
                            {resumeData.summary}
                        </div>

                    </div>


                    <div className="cv-section timeline">
                        <div className="timeline-starter"></div>
                        <div className="timeline-line"></div>

                        {resumeData.positions &&
                        <div className="section-position">
                            <h2 className="section-title">
                                <span suppressContentEditableWarning={true} contentEditable>Experience</span>
                            </h2>

                            { resumeData.positions.values.map((p, i) =>
                                <div key={i} className="timeline-section">

                                    {this.renderTimeline(p)}

                                    <div className="timeline-right">
                                        <h3><span suppressContentEditableWarning={true} contentEditable>{p.title}</span>
                                        </h3>
                                        <h4><span suppressContentEditableWarning={true}
                                                  contentEditable>{p.companyName}</span>
                                        </h4>
                                        {p.location &&
                                        <div className="timeline-location">
                                            <i className="ion-ios-location"></i> <span>{p.location}</span>
                                        </div>
                                        }
                                        <p>
                                            <span suppressContentEditableWarning={true}
                                                  contentEditable dangerouslySetInnerHTML={{__html: this.toHtml(p.summary || p.description)}}></span>

                                        </p>


                                    </div>

                                </div>
                            )}
                        </div> }

                        {resumeData.education &&
                        <div className="section-education">
                            <h2 className="section-title timeline-seperator">
                                <span suppressContentEditableWarning={true} contentEditable>Education</span>
                            </h2>

                            { resumeData.education.values.map((p, i) =>
                                <div key={i} className="timeline-section">

                                    <div className="timeline-left">
                                <span suppressContentEditableWarning={true} contentEditable>{p.startDate}&nbsp;
                                    - {p.endDate}</span>
                                    </div>


                                    <div className="timeline-right">
                                        <h3><span suppressContentEditableWarning={true}
                                                  contentEditable>{p.schoolName}</span>
                                        </h3>
                                        <h4><span suppressContentEditableWarning={true}
                                                  contentEditable>{p.degreeName}</span>
                                        </h4>
                                        <p>
                                            <span suppressContentEditableWarning={true} contentEditable>{p.notes}</span>
                                        </p>
                                    </div>

                                </div>)}
                        </div>
                        }


                        {resumeData.projects &&
                        <div className="section-projects">
                            <h2 className="section-title timeline-seperator">
                                <span suppressContentEditableWarning={true} contentEditable>Projects</span>
                            </h2>

                            { resumeData.projects.values.map((p, i) =>
                                <div key={i} className="timeline-section">

                                    <div className="timeline-left">
                                <span suppressContentEditableWarning={true} contentEditable>{p.startedOn}&nbsp;
                                    - {p.finishedOn || 'Today'}</span>
                                    </div>


                                    <div className="timeline-right">
                                        <h3><span suppressContentEditableWarning={true} contentEditable>{p.title}</span>
                                        </h3>
                                        <p>
                                            <span suppressContentEditableWarning={true}
                                                  contentEditable dangerouslySetInnerHTML={{__html: this.toHtml(p.description)}}></span>
                                        </p>
                                    </div>

                                </div>)}
                        </div>
                        }

                    </div>


                    <div className="cv-section blocks" style={{
                        "borderTop": "1px solid #E5E5E5"}}>
                        {resumeData.skills &&
                        <div className="col-md-12">
                            <h2 className="section-title">
                                <span suppressContentEditableWarning={true} contentEditable>Skills</span>
                            </h2>


                            <ul className="pills">
                                { resumeData.skills.values.map((p, i) =>
                                    <li key={i}>
                                        <span className="label label-pill" suppressContentEditableWarning={true}
                                              contentEditable>{p.name}</span>

                                    </li>
                                )}
                            </ul>

                        </div>
                        }


                        <Row>
                            {resumeData.courses &&
                            <Col md={4}>
                                <h2 className="section-title">
                                    <span suppressContentEditableWarning={true} contentEditable>Courses</span>
                                </h2>

                                <ul>
                                    { resumeData.courses.values.map((p, i) =>
                                        <li key={i}>
                                            <span className="label" suppressContentEditableWarning={true}
                                                  contentEditable>{p.name}</span>

                                        </li>
                                    )}
                                </ul>
                            </Col>
                            }

                            {resumeData.interests &&
                            <Col md={4}>
                                <h2 className="section-title">
                                    <span suppressContentEditableWarning={true} contentEditable>Interests</span>
                                </h2>

                                <ul>
                                    { resumeData.interests.values.map((p, i) =>
                                        <li key={i}>
                                            <span className="label" suppressContentEditableWarning={true}
                                                  contentEditable>{p.supportedCause}</span>

                                        </li>
                                    )}
                                </ul>
                            </Col>
                            }


                            {resumeData.languages &&
                            <Col md={4}>
                                <h2 className="section-title">
                                    <span suppressContentEditableWarning={true} contentEditable>Languages</span>
                                </h2>

                                <ul className="list">
                                    { resumeData.languages.values.map((p, i) =>
                                        <li key={i}>
                                            <span className="label" suppressContentEditableWarning={true}
                                                  contentEditable>{p.name}</span>
                                            <small suppressContentEditableWarning={true}
                                                   contentEditable>{p.proficiency}</small>
                                        </li>
                                    )}
                                </ul>
                            </Col>
                            }
                        </Row>

                    </div>
                </div>
            </div>
            <div className="cv-print-clone"></div>
        </div>

    }

    toHtml(str){
        return str.replace(/(\r\n|\n|\r)/g,'<br />').replace(/(・)/g,'<br />・')
    }


    toDataUrl(url, callback) {
        if( url ) {
            var xhr = new XMLHttpRequest()
            xhr.onload = function () {
                var reader = new FileReader()
                reader.onloadend = function () {
                    callback(reader.result)
                }
                reader.readAsDataURL(xhr.response)
            }
            xhr.open('GET', url)
            xhr.responseType = 'blob'
            xhr.send()
        }
    }
}


PrettyResume.propTypes = {
    resumeData: PropTypes.object.isRequired
}


export default PrettyResume

