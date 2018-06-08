import React from 'react';
import {Editor, EditorState, convertFromRaw} from 'draft-js';

const PostRenderer = (props) => {
    const parsedContent =  convertFromRaw(JSON.parse(props.data));
    const editorState = EditorState.createWithContent(parsedContent)
    return (
        <div className="readonly-editor">
            <Editor editorState={editorState} readOnly={true} />
        </div>
    )
}

export default PostRenderer

