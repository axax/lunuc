import ChildProcess from'child_process'

export const heicConvert = ({source, target, quality})=>{

    return new Promise(function (resolve) {

        const tags = []
        if(quality){
            tags.push(`-q ${quality}`)
        }
        tags.push(source)
        tags.push(target)
        console.log('heif-convert '+tags.join(' '))
        const convert = ChildProcess.spawn('heif-convert', tags)

        convert.on('error', (err) => {
            resolve({error: err})
        })

        // Read the binary data back
        let response = '', errorMessage = ''
        convert.stdout.on("data", (data)=>  {
            response += data
        })

        // Read an error response back and deal with it.
        convert.stderr.on("data", (data)=> {
            errorMessage += data.toString()
        })

        // Handle the response to the callback to hand the metadata back.
        convert.on("close", () => {
            if (errorMessage)
            {
                resolve({error:errorMessage})
            }
            else
            {
                resolve({response})
            }
        })
    })
}