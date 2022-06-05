import Hook from './hook.cjs'

const HookAsync = {
    call: async (hookName, args) => {
        if (Hook.hooks[hookName] && Hook.hooks[hookName].length) {
            for (let i = 0; i < Hook.hooks[hookName].length; ++i) {
                await Hook.hooks[hookName][i].callback(args)
            }
        }
    }
}

export default HookAsync
