import React from 'react'
import BaseLayout from 'client/components/layout/BaseLayout'
import TypesContainer from 'client/containers/TypesContainer'
import PropTypes from 'prop-types'
import Hook from 'util/hook'
import {
    SimpleSelect,
    Typography
} from 'ui/admin'
import extensions from 'gen/extensions'

const TYPE = 'Word'

class WordContainer extends React.Component {

    constructor(props) {
        super(props)

        this.state = {
            currentPair: ''
        }

        this.typeContainer = React.createRef()
    }


    render() {
        const startTime = (new Date()).getTime()
        const {history, location, match} = this.props
        const {currentPair} = this.state
        const selectFrom = [], selectTo = [], pairs = [], selectPairs = []

        extensions.word.options.types[0].fields.forEach((a) => {
            if (a.name.length === 2) {
                extensions.word.options.types[0].fields.forEach((b) => {
                    if (b.name.length === 2 && b.name !== a.name) {
                        const name = a.name + ' / ' + b.name
                        if (!pairs.includes(name) && !pairs.includes(b.name + ' / ' + a.name)) {
                            pairs.push(name)
                            selectPairs.push({value: name, name})
                        }
                    }
                })
            }
        })


        const content = (
            <BaseLayout>
                <Typography variant="display2" gutterBottom>Words</Typography>
                <SimpleSelect
                    value={currentPair}
                    onChange={this.handlePairChange.bind(this)}
                    items={selectPairs}
                />
                <TypesContainer onRef={ref => (this.typeContainer = ref)}
                                onSettings={this.typeSetting.bind(this)}
                                baseUrl={location.pathname}
                                title={false}
                                noLayout={true}
                                fixType={ TYPE }
                                history={history} location={location} match={match}/>
            </BaseLayout>
        )


        console.info(`render ${this.constructor.name} in ${(new Date()).getTime() - startTime}ms`)

        return content
    }

    typeSetting(settings) {
        if (settings[TYPE]) {
            const {currentPair} = settings[TYPE]
            if( currentPair )
                this.setState({currentPair})
        }
    }

    refrehTypeSetting() {
        const {currentPair} = this.state
        const settings = Object.assign({}, this.typeContainer.settings[TYPE])
        if (settings.columns) {
            settings.columns = Object.keys(settings.columns)
                .filter(key => key.length > 2)
                .reduce((obj, key) => {
                    obj[key] = settings.columns[key];
                    return obj;
                }, {})
        } else {
            settings.columns = {}
        }

        const a = currentPair.split('/'), fromSelected = a[0].trim(), toSelected = (a.length>1?a[1].trim():'')


        extensions.word.options.types[0].fields.forEach((a) => {
            if (a.name.length === 2) {
                settings.columns[a.name] = false
            }
        })

        if (fromSelected) {
            settings.columns[fromSelected] = true
        }

        if (toSelected) {
            settings.columns[toSelected] = true
        }

        settings.currentPair = currentPair


        this.typeContainer.setSettingsForType(TYPE, settings)
        this.typeContainer._lastData = null

        this.typeContainer.forceUpdate()
    }

    handlePairChange(e) {
        const o = {currentPair: e.target.value}
        this.setState(o, this.refrehTypeSetting)
    }

}


WordContainer.propTypes = {
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired
}


export default WordContainer


// add an extra column for Media at the beginning
Hook.on('TypeTableColumns', ({type, columns}) => {
    if (type === TYPE) {

    }
})