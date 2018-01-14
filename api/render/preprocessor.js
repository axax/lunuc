import less from 'less'

module.exports = (data, filename) => {
    return less.render(data)
}