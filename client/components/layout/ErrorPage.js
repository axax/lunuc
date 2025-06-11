import React from 'react'
import DomUtil from '../../util/dom.mjs'
import {_t, registerTrs} from '../../../util/i18n.mjs'


class ErrorPage extends React.Component {


    getErrorStatus(props) {

        return {
            code: props.code || '404',
            title: props.title || _t('ErrorPage.title.404'),
            message: props.message || (props.code==='401'?_app_.user.username + ' ist nicht berechtigt diese Seite zu öffnen':_t('ErrorPage.message.404')),
            background: props.background || '#33cc99',
            hideBackButton: props.hideBackButton
        }

    }

    constructor(props) {
        super(props)

        registerTrs({
            de:{
                'ErrorPage.title.404':'Seite nicht gefunden',
                'ErrorPage.message.404':'Bitte entschuldigen Sie - der gesuchte Seite existiert nicht mehr.',
                'ErrorPage.backButton':'Zurück zur Startseite'
            },
            en:{
                'ErrorPage.title.404':'Page not found',
                'ErrorPage.message.404':'We are sorry.',
                'ErrorPage.backButton': 'Back to Home'
            }
        }, 'ErrorPage')


        const {code, title, message, background} = this.getErrorStatus(props)
        this.titleOri = document.title
        document.title = `${code} ${title}`

        DomUtil.noIndexNoFollow()

        this.css = document.createElement("style")
        this.css.type = "text/css"
        this.css.textContent = `
body{
    background: ${background};
    color:#fff;
    font-family: 'Open Sans', sans-serif;
    max-height:700px;
    overflow: hidden;
}
.c{
    text-align: center;
    display: block;
    position: relative;
    width:80%;
    margin:100px auto;
}
._404{
    font-size: 30vmin;
    position: relative;
    display: inline-block;
    z-index: 2;
    letter-spacing: 15px;
}
._1{
    text-align:center;
    display:block;
    position:relative;
    letter-spacing: 6px;
    font-size: 8vmin;
    line-height: 100%;
    margin: 20px 0;
}
._2{
    text-align:center;
    display:block;
    position: relative;
    font-size: 20px;
    margin: 20px 0;
}
.text{
    font-size: 70px;
    text-align: center;
    position: relative;
    display: inline-block;
    margin: 19px 0px 0px 0px;
    z-index: 3;
    width: 100%;
    line-height: 1.2em;
    display: inline-block;
}


.btn{
    background-color: rgb( 255, 255, 255 );
    position: relative;
    display: inline-block;
    width: 358px;
    max-width:100%;
    padding: 5px;
    line-height:1;
    z-index: 5;
    font-size: 25px;
    margin:0 auto;
    color:${background};
    text-decoration: none;
    margin-right: 10px
}
.right{
    float:right;
    width:60%;
}

hr{
    padding: 0;
    border: none;
    border-top: 5px solid #fff;
    color: #fff;
    text-align: center;
    margin: 0px auto;
    width: 420px;
    max-width:100%;
    height:10px;
    z-index: -10;
}

hr:after {
    content: "\\2022";
    display: inline-block;
    position: relative;
    top: -0.75em;
    font-size: 2em;
    padding: 0 0.2em;
    background: ${background};
}

#clouds{
    overflow:hidden;
    position:fixed;
    top:0;
    left:0;
    bottom:0;
    right:0;
}

.cloud {
    width: 350px; height: 120px;
    background: #FFF;
    background: linear-gradient(top, #FFF 100%);
    border-radius: 100px;
    position: absolute;
    margin: 120px auto 20px;
    z-index:-1;
    transition: ease 1s;
}

.cloud:after, .cloud:before {
    content: '';
    position: absolute;
    background: #FFF;
    z-index: -1
}

.cloud:after {
    width: 100px; height: 100px;
    top: -50px; left: 50px;
    border-radius: 100px;
}

.cloud:before {
    width: 180px; height: 180px;
    top: -90px; right: 50px;
    border-radius: 200px;
}

.x1 {
    top:-50px;
    left:100px;
    transform: scale(0.3);
    opacity: 0.9;
    animation: moveclouds 15s linear infinite;
}

.x1_5{
    top:-80px;
    left:250px;
    transform: scale(0.3);
    animation: moveclouds 17s linear infinite;
}

.x2 {
    left: 250px;
    top:30px;
    transform: scale(0.6);
    opacity: 0.6; 
    animation: moveclouds 25s linear infinite;
}

.x3 {
    left: 250px; bottom: -70px;
    transform: scale(0.6);
    opacity: 0.8; 
    animation: moveclouds 25s linear infinite;
}

.x4 {
    left: 470px; botttom: 20px;
    transform: scale(0.75);
    opacity: 0.75;

    animation: moveclouds 18s linear infinite;
}

.x5 {
    left: 200px; top: 300px;
    transform: scale(0.5);
    opacity: 0.8; 

    animation: moveclouds 20s linear infinite;
}

@-webkit-keyframes moveclouds {
    0% {margin-left: 1000px;}
    100% {margin-left: -1000px;}
}
@-moz-keyframes moveclouds {
    0% {margin-left: 1000px;}
    100% {margin-left: -1000px;}
}
@-o-keyframes moveclouds {
    0% {margin-left: 1000px;}
    100% {margin-left: -1000px;}
}
`

        document.body.appendChild(this.css)
    }

    componentWillUnmount() {
        document.title = this.titleOri
        document.body.removeChild(this.css)
        DomUtil.removeElements('#noIndexNoFollow', null, document.head)
    }

    render() {

        const {code, title, message, hideBackButton} = this.getErrorStatus(this.props)

        return <div>
            <div id="clouds">
                <div className="cloud x1"></div>
                <div className="cloud x1_5"></div>
                <div className="cloud x2"></div>
                <div className="cloud x3"></div>
                <div className="cloud x4"></div>
                <div className="cloud x5"></div>
            </div>
            <div className='c'>
                <div className='_404'>{code}</div>
                <hr/>
                <div className="_1">{title.toUpperCase()}</div>
                <div className="_2">{message}</div>
                {code==401 ? <a className='btn' onClick={(e) => {
                    e.preventDefault()
                    location.href = location.origin+'/admin/login?forward='+location.pathname
                }} href="#">Mit einem anderen Benutzer anmelden</a>: !hideBackButton && <a className='btn' onClick={(e) => {
                    e.preventDefault()
                    location.href = location.origin
                }} href="#">{_t('ErrorPage.backButton')}</a>}



            </div>
        </div>
    }
}

export default ErrorPage
