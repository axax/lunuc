import React from 'react'
import update from 'immutability-helper'
import GenericForm from '../components/generic/GenericForm'
import genericComposer from './generic/genericComposer'
import BaseLayout from '../components/layout/BaseLayout'
import {Row, Col, Table} from '../components/ui/index'
import logger from '../logger'
import Util from '../util'

const WORDS_PER_PAGE = 10


class WordContainer extends React.Component {
    static logger = logger(WordContainer.name)

    constructor(props) {
        super(props)
        this.debug = WordContainer.logger.debug
    }

    componentWillMount() {
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
                update(data, {[lang]: {$set: t}})
            )
        }
    }

    handleDeleteWordClick = (data) => {
        const {deleteWord} = this.props
        deleteWord({
            _id: data._id
        })
    }

    handleFilter = ({value}) => {
        this.props.refetchWords({filter: value})
    }

    handleChangePage = (page) => {
        this.props.history.push(`/word/${(page)}`)
    }

    render() {
        const {words, loading} = this.props

        this.debug('render word')

        const currentPage = Math.ceil((words ? words.offset : 0) / WORDS_PER_PAGE)+1

        const columns = [{
                title: 'Deutsch',
                dataIndex: 'de'
                }, {
                    title: 'English',
                    dataIndex: 'en'
                },
                {
                    title: 'User',
                    dataIndex: 'user'
                },
                {
                    title: 'Created at',
                    dataIndex: 'date'
                },
                {
                    title: 'Actions',
                    dataIndex: 'action'
                }],
            dataSource = (words ? words.results.map((word) => ({
                de: <span onBlur={(e) => this.handleWordChange.bind(this)(e, word, 'de')}
                          suppressContentEditableWarning contentEditable>{word.de}</span>,
                en: <span onBlur={(e) => this.handleWordChange.bind(this)(e, word, 'en')}
                          suppressContentEditableWarning contentEditable>{word.en}</span>,
                user: word.createdBy.username,
                date: Util.formattedDateFromObjectId(word._id),
                action: <button disabled={(word.status == 'deleting' || word.status == 'updating')}
                                onClick={this.handleDeleteWordClick.bind(this, word)}>Delete
                </button>
            })) : [])

        return (
            <BaseLayout>
                <h1>Words</h1>
                <Row spacing={16}>
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

                <Table dataSource={dataSource} columns={columns} count={(words ? words.total : 0)} rowsPerPage={WORDS_PER_PAGE} page={currentPage} onChangePage={this.handleChangePage.bind(this)} />

            </BaseLayout>
        )
    }
}


export default genericComposer(WordContainer, 'word', {
    hasFilter: true,
    fields: {'en': 'String!', 'de': 'String'},
    limitPerPage: WORDS_PER_PAGE
})
