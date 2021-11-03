
/* this is only experimental */

const stream = (socket)=>{
    socket.on('subscribe', (data)=>{
        //subscribe/join a room
        socket.join(data.room)
        socket.join(data.socketId)

        const roomSessions = socket.adapter.rooms.get(data.room)
        //Inform other members in the room of new user's arrival
        if(roomSessions && roomSessions.size > 1){
            console.log('new user')
            socket.to(data.room).emit('new user', {socketId:data.socketId, username: data.username})
        }

    })

    socket.on('error', (e) => {
        console.log('http error in stream socket', e)
    })

    socket.on('newUserStart', (data)=>{
        socket.to(data.to).emit('newUserStart', {sender:data.sender})
    })


    socket.on('sdp', (data)=>{
        socket.to(data.to).emit('sdp', {description: data.description, sender:data.sender})
    })


    socket.on('ice candidates', (data)=>{
        socket.to(data.to).emit('ice candidates', {candidate:data.candidate, sender:data.sender})
    })


    socket.on('chat', (data)=>{
        socket.to(data.room).emit('chat', {sender: data.sender, msg: data.msg})
    })
}

module.exports = stream
