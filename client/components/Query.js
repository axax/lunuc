import React from 'react'
import {useQuery} from '../middleware/graphql'

export function Query() {
    // Declare a new state variable, which we'll call "count"
    const {loading, data} = useQuery({"variables":{"dynamic":false,"slug":"test","editmode":true},"query":"query cmsPage($slug: String!, $query: String, $props: String, $nosession: String, $editmode: Boolean, $dynamic: Boolean, $_version: String) {\n  cmsPage(slug: $slug, query: $query, props: $props, nosession: $nosession, editmode: $editmode, dynamic: $dynamic, _version: $_version) {\n    cacheKey\n    slug\n    realSlug\n    name {\n      de\n      en\n      fr\n      it\n      __typename\n    }\n    urlSensitiv\n    template\n    script\n    serverScript\n    resources\n    dataResolver\n    ssr\n    public\n    online\n    resolvedData\n    style\n    parseResolvedData\n    alwaysLoadAssets\n    ssrStyle\n    compress\n    html\n    subscriptions\n    _id\n    modifiedAt\n    createdBy {\n      _id\n      username\n      __typename\n    }\n    status\n    __typename\n  }\n}\n"})
    console.log(loading, data)
    return (
        <div>
            <p>is loading {loading?'true':'false'}</p>
        </div>
    )
}
