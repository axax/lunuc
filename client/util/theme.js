import {setThemeName, THEME_KEY} from 'ui/admin'
import {setKeyValue} from './keyvalue'

// applies the theme immediately and stores it in the user profile (key value)
export const saveUserTheme = (value) => {
    setThemeName(value)
    return setKeyValue({key: THEME_KEY, value})
}
