import React from 'react'
import {render} from 'react-dom'

import App from './components/App'

import configureStore from './store/index'

const {store,persistor} = configureStore()

render(
	<App store={store} persistor={persistor} />,
	document.getElementById('app')
)

/* Register serviceworker */
if ('serviceWorker' in navigator ) {
	console.log('Service Worker is supported')

	if( 'PushManager' in window ){
		console.log('Push is supported')

		navigator.serviceWorker.register('/serviceworker.js')
			.then(function (swReg) {
				console.log('Service Worker is registered', swReg)
			})
			.catch(function (error) {
				console.error('Service Worker Error', error)
			})
	}else{
		console.warn('Push is not supported')
	}


} else {
	console.warn('Service Worker is not supported')
}