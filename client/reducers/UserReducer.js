export default function user(state = {userData:null,isAuthenticated:false}, action) {
	switch (action.type) {
		case 'USER_SET':
            return Object.assign({},state,{userData:action.userData,isAuthenticated:action.isAuthenticated})
		default:
			return state
	}
}
