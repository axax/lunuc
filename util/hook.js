const Hook = {
    hooks: {},
    hooksOrder: {},
    on: function (name, callback, order) {
        if ('undefined' == typeof( Hook.hooks[name] )) {
            Hook.hooks[name] = []
        }
        if( !order ){
            order = 1
        }

        for (let i = 0; i < Hook.hooks[name].length; i++) {
            const hook = Hook.hooks[name][i]
            if (hook.order > order) {
                Hook.hooks[name].splice(i, 0, {callback, order})
                return
            }
        }
        Hook.hooks[name].push({callback, order})

    },
    call: function (name, args, thisRef) {
        if ('undefined' != typeof( Hook.hooks[name] )) {
            for (var i = 0; i < Hook.hooks[name].length; ++i) {
                if (thisRef) {
                    Hook.hooks[name][i].callback.bind(thisRef)(args)
                } else {
                    Hook.hooks[name][i].callback(args)
                }
            }
        }
    }
}

export default Hook