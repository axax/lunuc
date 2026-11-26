// file browser of the admin (/admin/files, client/containers/FilesContainer.js), impl. api/resolver/files.mjs
export const filesSchemaRaw = `

    type FileSpace {
        value: String!
        name: String!
        root: String!
        system: Boolean
    }

    type FileEntry {
        name: String!
        type: String!
        size: Float
        mtime: Float
        mode: String
        target: String
        targetType: String
    }

    type FileList {
        dir: String!
        entries: [FileEntry]
        truncated: Boolean
    }

    type FileContent {
        path: String!
        content: String
        size: Float
        mtime: Float
        mode: String
        owner: String
        writable: Boolean
        binary: Boolean
        tooLarge: Boolean
        hasBackup: Boolean
    }

    type FileSearchHit {
        path: String!
        line: Int
        text: String
    }

    type FileSearchResult {
        hits: [FileSearchHit]
        truncated: Boolean
    }

    type FileWriteResult {
        path: String!
        mtime: Float
        size: Float
        backup: Boolean
    }

    type FileOperationResult {
        status: String
        path: String
    }

    type Query {
        fileSpaces: [FileSpace]
        listFiles(space: String!, dir: String): FileList
        readFile(space: String!, path: String!, backup: Boolean): FileContent
        searchFiles(space: String!, dir: String, text: String!): FileSearchResult
    }

    type Mutation {
        writeFile(space: String!, path: String!, content: String!, expectedMtime: Float, backup: Boolean, force: Boolean): FileWriteResult
        fileOperation(space: String!, path: String!, operation: String!, newName: String): FileOperationResult
    }
`
