import React from 'react'
import TypesContainer from 'client/containers/TypesContainer'
import PropTypes from 'prop-types'
import {
    Row,
    Col,
    SimpleSelect,
    Typography
} from 'ui/admin'
import GenericForm from 'client/components/GenericForm'
import extensions from '../../../gensrc/extensions.mjs'
import compose from 'util/compose'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {graphql} from '../../../client/middleware/graphql'

const TYPE = 'Word'

class WordContainer extends React.Component {

    constructor(props) {
        super(props)
        this.state = props.keyValueMap.WordContainerState || {
                currentPair: '',
                currentCategory: ''
            }
        this.prepareTypeSetting()
        this.typeContainer = React.createRef()

    }


    render() {
        const startTime = (new Date()).getTime()
        const {history, location, match, wordCategorys} = this.props
        const {currentPair, currentCategory} = this.state
        const selectFrom = [], selectTo = [], pairs = [], selectPairs = [], categoryPair = []
        const a = currentPair.split('/'), fromSelected = a[0].trim(), toSelected = (a.length > 1 ? a[1].trim() : '')

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
        categoryPair.push({value: 'all', name: 'All'})
        wordCategorys && wordCategorys.results.forEach(e => {
            categoryPair.push({value: e._id, name: e.name})
        })
        const content = <>
                <Typography variant="h3" component="h1" gutterBottom>Words</Typography>


                <Row>
                    <Col md={6}>
                        <SimpleSelect
                            label="Language pair"
                            value={currentPair}
                            onChange={this.handlePairChange.bind(this)}
                            items={selectPairs}
                        />
                        <SimpleSelect
                            label="Category"
                            value={currentCategory}
                            onChange={this.handleCategoryChange.bind(this)}
                            items={categoryPair}
                        />
                    </Col>
                    <Col md={6}>
                        {fromSelected && toSelected && <GenericForm fields={{
                            [fromSelected]: {value: '', label: fromSelected},
                            [toSelected]: {value: '', label: toSelected}
                        }}
                                                                    onValidate={this.handleAddValidate}
                                                                    onClick={this.handleAddClick.bind(this)}/>}
                    </Col>
                </Row>
                <TypesContainer onRef={ref => (this.typeContainer = ref)}
                                baseUrl={location.pathname}
                                title={false}
                                fixType={ TYPE }
                                settings={this.settings}
                                baseFilter={currentCategory && currentCategory !== 'all' ? 'categories:' + currentCategory : ''}
                                history={history} location={location} match={match}/>
            </>


        console.info(`render ${this.constructor.name} in ${(new Date()).getTime() - startTime}ms`)

        return content
    }


    handleAddValidate(e) {
        for (const k of Object.keys(e)) {
            if (e[k] === '') return {isValid:false}
        }
        return {isValid:true}
    }

    handleAddClick(e) {
        const {wordCategorys} = this.props
        const {currentCategory} = this.state
        let cat = null

        if (currentCategory && wordCategorys.results)
            cat = wordCategorys.results.filter(f => f._id === currentCategory)

        const submitData = Object.assign({}, e, {categories: cat && cat.length ? cat[0]._id : null})
        extensions.word.options.types[0].fields.forEach((a) => {
            if (submitData[a.name] === undefined) {
                submitData[a.name] = null
            }
        })
        const optimisticData = Object.assign({}, submitData)
        optimisticData.categories = cat

        this.typeContainer.createData(submitData, optimisticData)
    }

    prepareTypeSetting() {
        const {currentPair} = this.state
        const settings = {[TYPE]: {columns: {}}}

        const a = currentPair.split('/'), fromSelected = a[0].trim(), toSelected = (a.length > 1 ? a[1].trim() : '')


        extensions.word.options.types[0].fields.forEach((a) => {
            if (a.name.length === 2) {
                settings[TYPE].columns[a.name] = false
            }
        })

        if (fromSelected) {
            settings[TYPE].columns[fromSelected] = true
        }

        if (toSelected) {
            settings[TYPE].columns[toSelected] = true
        }
        this.settings = settings
    }

    refrehTypeSetting() {
        this.props.setKeyValue({key: 'WordContainerState', value: this.state})
        this.prepareTypeSetting()
    }

    handlePairChange(e) {
        const o = {currentPair: e.target.value}
        this.setState(o, this.refrehTypeSetting)
    }

    handleCategoryChange(e) {
        const o = {currentCategory: e.target.value}
        this.setState(o, this.refrehTypeSetting)
    }

}


WordContainer.propTypes = {
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    /* To get and set settings */
    setKeyValue: PropTypes.func.isRequired,
    keyValueMap: PropTypes.object
}


const WordContainerWithGql = compose(
    graphql(`query{wordCategorys{results{_id name}}}`, {
        props: ({data: {wordCategorys}}) => ({
            wordCategorys
        })
    })
)(WordContainer)


export default withKeyValues(WordContainerWithGql, ['WordContainerState'])
