import React from 'react'
import GenericForm from 'client/components/generic/GenericForm'
import genericComposer from 'client/containers/generic/genericComposer'
import BaseLayout from 'client/components/layout/BaseLayout'
import {Row, Col, SimpleTable, SimpleDialog, DeleteIconButton, LinearProgress} from 'ui/admin'
import Util from 'client/util'
import PropTypes from 'prop-types'
import {ADMIN_BASE_URL} from 'gen/config'

const WORDS_PER_PAGE = 10

class WordContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            orderBy: '_id',
            orderDirection: 'desc',
            rowsPerPage: WORDS_PER_PAGE,
            confirmDeletionDialog: false,
            dataToBeDeleted: false
        }
    }

    handleAddWordClick = (data) => {
        const {createWord} = this.props
        createWord({
            en: data.en,
            de: data.de
        }).then(() => {
            this.addWordForm.reset()
        })
    }

    handleAddWordValidate = (data) => {
        return data.en.trim() !== '' && data.de.trim() !== ''
    }

    handleWordChange = (event, data, lang) => {

        const t = event.target.innerText
        if (t != data[lang]) {
            const {updateWord} = this.props
            updateWord(
                Object.assign({},data,{[lang]:t})
            )
        }
    }

    handleDeleteWordClick = (data) => {
        this.setState({confirmDeletionDialog: true, dataToBeDeleted: data})
    }

    handleFilter = ({value}) => {
        this.props.refetchWords({filter: value})
    }

    handleChangeRowsPerPage = (rowsPerPage) => {
        this.setState({rowsPerPage})
        this.props.setOptionsForWords({limit: rowsPerPage})
        this.props.refetchWords()
    }

    handleChangePage = (page) => {
        this.props.history.push(`${ADMIN_BASE_URL}/word/${(page)}`)
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            const {deleteWord} = this.props
            deleteWord({
                _id: this.state.dataToBeDeleted._id
            })
        }
        this.setState({confirmDeletionDialog: false, dataToBeDeleted: false})
    }

    handleSortChange = (e, orderBy) => {

        let orderDirection = 'desc';

        if (this.state.orderBy === orderBy && this.state.orderDirection === 'desc') {
            orderDirection = 'asc';
        }

        this.props.setOptionsForWords({sort: `${orderBy} ${orderDirection}`})
        this.props.refetchWords()
        this.setState({orderBy, orderDirection})
    }

    render() {
        const startTime = (new Date()).getTime()
        const {words, loading} = this.props


        const currentPage = Math.ceil((words ? words.offset : 0) / this.state.rowsPerPage) + 1

        const columns = [{
            title: 'Deutsch',
            dataIndex: 'de',
            sortable: true
        }, {
            title: 'English',
            dataIndex: 'en',
            sortable: true
        },
            {
                title: 'User',
                dataIndex: 'user'
            },
            {
                title: 'Created at',
                dataIndex: '_id',
                sortable: true
            },
            {
                title: 'Actions',
                dataIndex: 'action'
            }]

        const dataSource = words && words.results && words.results.map((word) => ({
                    de: <span onBlur={(e) => this.handleWordChange.bind(this)(e, word, 'de')}
                              suppressContentEditableWarning contentEditable>{word.de}</span>,
                    en: <span onBlur={(e) => this.handleWordChange.bind(this)(e, word, 'en')}
                              suppressContentEditableWarning contentEditable>{word.en}</span>,
                    user: word.createdBy.username,
                    _id: Util.formattedDateFromObjectId(word._id),
                    action: <DeleteIconButton disabled={(word.status == 'deleting' || word.status == 'updating')}
                                              onClick={this.handleDeleteWordClick.bind(this, word)}>Delete
                    </DeleteIconButton>
                }))

        const content = (
            <BaseLayout>
                <h1>Words</h1>
                <Row spacing={16} style={{marginBottom: 50}}>
                    <Col md={6}>
                        <GenericForm caption="Add Word" ref={(e) => {
                            this.addWordForm = e
                        }} fields={{en: {placeholder: 'English'}, de: {placeholder: 'Deutsch'}}}
                                     onValidate={this.handleAddWordValidate}
                                     onClick={this.handleAddWordClick}/>
                    </Col>
                    <Col md={6}>
                        <GenericForm onChange={this.handleFilter} primaryButton={false}
                                     fields={{term: {placeholder: 'Filter'}}}/>
                    </Col>
                </Row>

                <SimpleTable dataSource={dataSource}
                       columns={columns}
                       count={(words ? words.total : 0)}
                       rowsPerPage={this.state.rowsPerPage}
                       page={currentPage}
                       orderBy={this.state.orderBy}
                       orderDirection={this.state.orderDirection}
                       onSort={this.handleSortChange}
                       onChangePage={this.handleChangePage.bind(this)}
                       onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>

                <SimpleDialog open={this.state.confirmDeletionDialog} onClose={this.handleConfirmDeletion.bind(this)}
                        actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                        title="Confirm deletion">
                    Are you sure you want to delete the word
                    <strong>{Util.escapeHtml('"' + this.state.dataToBeDeleted.en)}
                        - {Util.escapeHtml(this.state.dataToBeDeleted.de + '"')}</strong>?
                </SimpleDialog>

                {loading && <LinearProgress mode="query" />}
            </BaseLayout>
        )


        console.info(`render ${this.constructor.name} in ${(new Date()).getTime() - startTime}ms`)

        return content
    }
}


WordContainer.propTypes = {
    history: PropTypes.object,
    words: PropTypes.object,
    createWord: PropTypes.func.isRequired,
    refetchWords: PropTypes.func.isRequired,
    updateWord: PropTypes.func.isRequired,
    deleteWord: PropTypes.func.isRequired,
    setOptionsForWords: PropTypes.func.isRequired,
    loading: PropTypes.bool
}


export default genericComposer(WordContainer, 'word', {
    hasFilter: true,
    fields: {'en': 'String!', 'de': 'String'},
    limit: WORDS_PER_PAGE
})
