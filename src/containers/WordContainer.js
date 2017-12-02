import React from 'react'
import Pagination from '../components/generic/Pagination'
import update from 'immutability-helper'
import GenericForm from '../components/generic/GenericForm'
import genericComposer from './generic/genericComposer'
import BaseLayout from '../components/layout/BaseLayout'


const WORDS_PER_PAGE = 10


class WordContainer extends React.Component {
    constructor(props) {
        super(props)
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

    render() {
        const {words, loading} = this.props

        if (!words)
            return null

        //console.log('render word', words)

        const totalPages = Math.ceil(words.total / WORDS_PER_PAGE),
            currentPage = Math.ceil(words.offset / WORDS_PER_PAGE) + 1

        return (
            <BaseLayout>
                <h1>Words</h1>
                <GenericForm caption="Add Word" ref={(e) => {
                    this.addWordForm = e
                }} fields={{en: {placeholder: 'English'}, de: {placeholder: 'Deutsch'}}}
                             onClick={this.handleAddWordClick}/>

                <i>words from {words.offset + 1} to {words.offset + words.results.length} of total {words.total}</i>
                <ul suppressContentEditableWarning={true}>
                    {(words.results ? words.results.map((word, i) => {
                        return <li key={i}>
                            <span onBlur={(e) => this.handleWordChange.bind(this)(e, word, 'de')}
                                  suppressContentEditableWarning contentEditable>{word.de}</span>=
                            <span onBlur={(e) => this.handleWordChange.bind(this)(e, word, 'en')}
                                  suppressContentEditableWarning contentEditable>{word.en}</span>
                            ({word.createdBy.username})
                            <button disabled={(word.status == 'deleting' || word.status == 'updating')}
                                    onClick={this.handleDeleteWordClick.bind(this, word)}>X
                            </button>
                        </li>
                    }) : '')}
                </ul>

                Page {currentPage} of {totalPages}

                <Pagination baseLink='/word/' currentPage={currentPage} totalPages={totalPages}/>


            </BaseLayout>
        )
    }
}


export default genericComposer(WordContainer, 'word', {fields: {'en': 'String!','de': 'String'},limitPerPage:WORDS_PER_PAGE})
