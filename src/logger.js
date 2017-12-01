import Environment from './environment'


const debugStyle = 'color: #006400; font-weight:bold'


export function debug(msg,data){
    if( Environment.DEBUG ){
        console.log('%c\n'+msg+":\n"+JSON.stringify(data),debugStyle)
    }
}