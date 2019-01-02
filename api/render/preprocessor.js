const less = require('less')

module.exports = (data, filename) => {
    return less.render(data)
}