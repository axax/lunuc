import Hook from 'util/hook'


Hook.on('ApiResponse', ({data}) => {
    if( data.products ){
        const results = data.products.results
        if( results ){
            results.forEach(e=>{
                //e.name = 'ssss'
                //console.log(e)
            })
        }
    }
})