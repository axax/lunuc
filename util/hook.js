const Hook = {
    hooks: [],
    on: function (name, callback) {
        if ('undefined' == typeof( Hook.hooks[name] )) {
            Hook.hooks[name] = []
        }
        Hook.hooks[name].push(callback)
    },
    call: function (name, args) {
        if ('undefined' != typeof( Hook.hooks[name] )) {
            for (var i = 0; i < Hook.hooks[name].length; ++i) {
                if (true != Hook.hooks[name][i](args)) {
                    break
                }
            }
        }
    }
}

export default Hook