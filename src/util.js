
const Util = {
	dateFromObjectId: (objectId) => {
		return new Date(parseInt(objectId.substring(0, 8), 16) * 1000)
	},
	formattedDateFromObjectId: (objectId) => {
		return new Intl.DateTimeFormat().format(Util.dateFromObjectId(objectId))
	}
}
export default Util