import Util from './index.mjs'

export const isFieldVisibleForCurrentUser = (field) => {
    return !((field.role && !Util.hasCapability(_app_.user, field.role)) ||
        (field.access && field.access.ui && field.access.ui.role && !Util.hasCapability(_app_.user, field.access.ui.role)))
}
