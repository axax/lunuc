import network from 'network'

let GATEWAY_IP


const getPublicIpAsPromise = ( url ) => {
    return new Promise ( ( resolve ) => {
        network.get_public_ip(function(error, ip) {
            resolve({error,ip})
        })
    })
}

export const getGatewayIp = async () =>{
    if(!GATEWAY_IP) {
        const response = await getPublicIpAsPromise()
        if(response.error){
            GATEWAY_IP = '127.0.0.1'
        }else{
            GATEWAY_IP = response.ip
        }
    }
    return GATEWAY_IP
}