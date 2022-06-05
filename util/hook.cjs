/*
Hook API

Define a hook call
Hook.call('Types', {types})

Add a method that gets called
Hook.on('Types', ({types}) => {
    types.KeyValue = {}
})
 */

const Hook = {
    hooks: {},
    hooksOrder: {},
    remove: (name ,key)=>{
        if(Hook.hooks[name]) {
            for (let i = Hook.hooks[name].length - 1; i >= 0; i--) {
                if (Hook.hooks[name][i].key === key) {
                    console.log(`remove hook ${name} with key ${key}`)
                    Hook.hooks[name].splice(i, 1)
                }
            }
        }
    },
    on: function (names, callback, order) {
        if (names.constructor !== Array) {
            names = [names]
        }
        names.forEach(nameWithKey => {
            const parts = nameWithKey.split('.'),
                name = parts[0],
                key = parts.length > 1 ? parts[1] : undefined

            if ('undefined' == typeof (Hook.hooks[name])) {
                Hook.hooks[name] = []
            }

            if (key) {
                Hook.remove(name, key)
            }

            if (!order) {
                order = 1
            }


            for (let i = 0; i < Hook.hooks[name].length; i++) {
                const hook = Hook.hooks[name][i]
                if (hook.order > order) {
                    Hook.hooks[name].splice(i, 0, {callback, order, key})
                    return
                }
            }
            Hook.hooks[name].push({callback, order, key})
        })

    },
    call: function (name, args, thisRef) {
        if ('undefined' != typeof (Hook.hooks[name])) {
            for (let i = 0; i < Hook.hooks[name].length; ++i) {
                if (thisRef) {
                    Hook.hooks[name][i].callback.bind(thisRef)(args)
                } else {
                    Hook.hooks[name][i].callback(args)
                }
            }
        }
    }
}
//export default Hook
module.exports = Hook
