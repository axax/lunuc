import GenericResolver from 'api/resolver/generic/genericResolver'

export default db => ({
    products: async ({sort, limit, offset, filter}, {context}) => {
        return await GenericResolver.entities(db, context, 'Product', ['name', 'description','price'], {limit, offset, filter, sort})
    },
    createProduct: async ({...rest}, {context}) => {
        return await GenericResolver.createEnity(db, context, 'Product', {...rest})
    },
    updateProduct: async ({...rest}, {context}) => {
        return GenericResolver.updateEnity(db, context, 'Product', {...rest})
    },
    deleteProduct: async ({_id}, {context}) => {
        return GenericResolver.deleteEnity(db, context, 'Product', {_id})
    }
})