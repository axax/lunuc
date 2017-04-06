var data = {
	keyvalue: {
		key1: 'value1',
		key2: 'value2',
		key3: 'value3'
	}
}

// The root provides a resolver function for each API endpoint
export const resolver = (db) => ({
	keyvalue: () => {
		console.log(db)
		return Object.keys(data.keyvalue).map((k) => ({key: k, id: k, value: data.keyvalue[k]}))
	},
	value: ({key}) => (data.keyvalue[key]),
	setValue: ({key, value}) => {
		data.keyvalue[key] = value
		// id is only needed for apollo to identify the object (dataIdFromObject)
		return {id: key, key: key, value: value}
	}
})