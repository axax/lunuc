const Hook = {
    hooks: [],
    on: function (name, callback) {
        if ('undefined' == typeof( Hook.hooks[name] )) {
            Hook.hooks[name] = []
        }
        Hook.hooks[name].push(callback)
    },
    call: function (name, args, thisRef) {
        if ('undefined' != typeof( Hook.hooks[name] )) {
            for (var i = 0; i < Hook.hooks[name].length; ++i) {
                if( thisRef){
                    Hook.hooks[name][i].bind(thisRef)(args)
                }else {
                    Hook.hooks[name][i](args)
                }
            }
        }
    }
}

export default Hook