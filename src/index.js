import React from 'react'
import {render} from 'react-dom'

import App from './components/App'

import configureStore from './store/index'

const store = configureStore()

render(
	<App store={store} />,
	document.getElementById('app')
)
