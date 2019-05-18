import {EditorState} from 'draft-js'
import UploadUtil from 'client/util/upload'


export default function onDropFile(config) {
    return function onDropFileInner(selection, files, {getEditorState, setEditorState}) {

        // Get upload function from config or editor props
        const {
            handleUpload,
            addImage
        } = config

        if (handleUpload) {


            const {validFiles, invalidFiles} = UploadUtil.validateFiles({
                files,
                accept: 'image/*',
                maxFileSize: 10 * 1024 * 1024
            })

            if (invalidFiles.length) {
                // TODO implement proper error handling
                alert(invalidFiles[0].message)
            } else {

                setEditorState(EditorState.acceptSelection(getEditorState(), selection));

                for (let i = 0, file; file = validFiles[i]; i++) {
                    const isImage = UploadUtil.isImage(file.name)


                    /*UploadUtil.uploadData({
                        dataUrl,
                        fileName: file.name,
                        uploadTo,
                        onProgress: () => {
                            // TODO implement progress bar
                        },
                        onLoad: (e) => {
                            const {status, message, ids} = e.target.response
                            if (status === 'success') {
                                if (ids && ids.length) {


                                    this.onChange(this.imagePlugin.addImage(editorState, '/uploads/' + ids[0]), null, true)
                                }

                            } else {
                                // TODO implement proper error handling
                            }
                        },
                        onError: (e) => {
                            // TODO implement proper error handling
                        }
                    })*/

                    if (isImage) {
                        UploadUtil.resizeImageFromFile({
                            file,
                            conversion: [{
                                maxWidth: 1000,
                                maxHeight: 100,
                                quality: 0.6
                            }],
                            onSuccess: (dataUrl) => {
                                setEditorState(addImage(getEditorState(), dataUrl))
                            }
                        })
                    } else {


                        // this.uploadData(config, getEditorState(), URL.createObjectURL(file), file)
                    }
                }
            }
            return 'handled';
        }

        return undefined
    }
}